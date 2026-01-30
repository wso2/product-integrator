using System;
using System.Collections.Generic;
using System.DirectoryServices.AccountManagement;
using System.IO.Compression;
using System.Linq;
using System.Management;
using System.Text;
using WixToolset.Dtf.WindowsInstaller;

namespace CustomAction1
{
    public class CustomActions
    {
        [CustomAction]
        public static ActionResult PrepareBallerinaBinaries(Session session)
        {
            session.Log("Begin PrepareBallerinaBinaries (immediate action)");

            try
            {
                // Create temp directory for Ballerina files
                string tempDir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "wso2bal_" + Guid.NewGuid().ToString("N").Substring(0, 8));
                System.IO.Directory.CreateDirectory(tempDir);
                session.Log($"Created temp directory: {tempDir}");

                string ballerinaZipPath = System.IO.Path.Combine(tempDir, "ballerina.zip");
                string versionFilePath = System.IO.Path.Combine(tempDir, "ballerina_version.txt");

                // Extract the Binary resources (only possible in immediate context)
                using (var view = session.Database.OpenView("SELECT `Name`, `Data` FROM `Binary` WHERE `Name` = 'BallerinaZip' OR `Name` = 'BallerinaVersion'"))
                {
                    view.Execute();
                    Record record;
                    while ((record = view.Fetch()) != null)
                    {
                        string name = record.GetString(1);
                        var stream = record.GetStream(2);

                        string targetPath = name == "BallerinaZip" ? ballerinaZipPath : versionFilePath;
                        using (var fileStream = System.IO.File.Create(targetPath))
                        {
                            stream.CopyTo(fileStream);
                        }
                        session.Log($"Extracted Binary resource: {name} to {targetPath}");
                    }
                }

                // Read the Ballerina version from the extracted file
                string ballerinaVersion = System.IO.File.ReadAllText(versionFilePath).Trim();
                session.Log($"Read Ballerina version: {ballerinaVersion}");

                // Prepare CustomActionData for the deferred actions
                // Format: KEY=VALUE;KEY=VALUE
                var customData = new StringBuilder();
                customData.Append("BALLERINA_HOME=").Append(session["BALLERINA_HOME"]).Append(";");
                customData.Append("INSTALLFOLDER=").Append(session["INSTALLFOLDER"]).Append(";");
                customData.Append("TEMP_DIR=").Append(tempDir).Append(";");
                customData.Append("ZIP_PATH=").Append(ballerinaZipPath).Append(";");
                customData.Append("VERSION_PATH=").Append(versionFilePath).Append(";");
                customData.Append("BALLERINA_VERSION=").Append(ballerinaVersion);

                // Set the property that will be passed to the extractBallerinaConditionally deferred action
                session["PrepareBallerinaData"] = customData.ToString();
                session.Log($"Set PrepareBallerinaData: {customData}");
                
                // Set CustomActionData for clearCurrentActiveBallerinaVersion (only needs version)
                session["ClearBallerinaData"] = $"BALLERINA_VERSION={ballerinaVersion}";
                session.Log($"Set ClearBallerinaData: BALLERINA_VERSION={ballerinaVersion}");

                return ActionResult.Success;
            }
            catch (Exception ex)
            {
                session.Log($"Error in PrepareBallerinaBinaries: {ex.Message}");
                session.Log($"Stack trace: {ex.StackTrace}");
                session.Log("Ballerina preparation failed - installation will be rolled back");
                return ActionResult.Failure;
            }
        }

        [CustomAction]
        public static ActionResult extractBallerinaConditionally(Session session)
        {
            session.Log("Begin extractBallerinaConditionally");

            try
            {
                // In deferred custom actions, we must read from CustomActionData instead of Session properties
                // The CustomActionData is set by the immediate custom action in WiX
                CustomActionData customData = session.CustomActionData;
                string ballerinaHomeEnv = customData["BALLERINA_HOME"];
                string installDir = customData["INSTALLFOLDER"];
                string tempDir = customData["TEMP_DIR"];
                string ballerinaZipPath = customData["ZIP_PATH"];
                string versionFilePath = customData["VERSION_PATH"];

                session.Log($"BALLERINA_HOME from CustomActionData: {ballerinaHomeEnv}");
                session.Log($"INSTALLFOLDER from CustomActionData: {installDir}");
                session.Log($"TEMP_DIR from CustomActionData: {tempDir}");
                session.Log($"ZIP_PATH from CustomActionData: {ballerinaZipPath}");

                // Ballerina will be installed to ProgramFiles (matches WiX BALLERINAFOLDER)
                string ballerinaInstallPath = System.IO.Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    "Ballerina");
                
                try
                {
                    // The Binary resources were already extracted in the immediate action
                    // Now we just use them
                    
                    if (!System.IO.File.Exists(versionFilePath))
                    {
                        session.Log("Error: Ballerina version file not found in temp directory");
                        return ActionResult.Failure;
                    }
                    
                    string ballerinaVersion = System.IO.File.ReadAllText(versionFilePath).Trim();
                    session.Log($"Ballerina version from package: {ballerinaVersion}");
                    
                    // Check if this version already exists
                    string versionPath = System.IO.Path.Combine(ballerinaInstallPath, "distributions", $"ballerina-{ballerinaVersion}");
                    
                    if (System.IO.Directory.Exists(versionPath))
                    {
                        session.Log($"Ballerina version {ballerinaVersion} already exists at {versionPath} - skipping extraction");
                        return ActionResult.Success;
                    }
                    
                    session.Log($"Installing Ballerina version {ballerinaVersion}");
                    
                    if (!System.IO.File.Exists(ballerinaZipPath))
                    {
                        session.Log($"Error: Ballerina zip not found at {ballerinaZipPath}");
                        return ActionResult.Failure;
                    }
                    
                    // Extract Ballerina zip
                    string extractPath = System.IO.Path.Combine(tempDir, "extract");
                    System.IO.Directory.CreateDirectory(extractPath);
                    
                    session.Log($"Extracting Ballerina zip to {extractPath}");
                    System.IO.Compression.ZipFile.ExtractToDirectory(ballerinaZipPath, extractPath);
                    
                    // Find the extracted ballerina folder
                    string[] dirs = System.IO.Directory.GetDirectories(extractPath, "ballerina-*");
                    if (dirs.Length == 0)
                    {
                        session.Log("Error: No ballerina-* directory found in extracted contents");
                        return ActionResult.Failure;
                    }
                    
                    string extractedBallerinaDir = dirs[0];
                    session.Log($"Found extracted Ballerina directory: {extractedBallerinaDir}");
                    
                    // Create target directory
                    System.IO.Directory.CreateDirectory(ballerinaInstallPath);
                    
                    // Copy all contents from extracted directory to Ballerina install path
                    session.Log($"Copying Ballerina files to {ballerinaInstallPath}");
                    CopyDirectory(extractedBallerinaDir, ballerinaInstallPath, session);
                    
                    session.Log("Ballerina installation completed successfully");
                }
                finally
                {
                    // Cleanup temp directory
                    if (System.IO.Directory.Exists(tempDir))
                    {
                        try
                        {
                            System.IO.Directory.Delete(tempDir, true);
                        }
                        catch (Exception cleanupEx)
                        {
                            session.Log($"Warning: Failed to cleanup temp directory: {cleanupEx.Message}");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                session.Log($"Error extracting Ballerina: {ex}");
                session.Log($"Stack trace: {ex.StackTrace}");
                return ActionResult.Failure;
            }

            return ActionResult.Success;
        }
        
        private static void CopyDirectory(string sourceDir, string destDir, Session session)
        {
            // Create destination directory
            System.IO.Directory.CreateDirectory(destDir);
            
            // Copy all files
            foreach (string file in System.IO.Directory.GetFiles(sourceDir))
            {
                string destFile = System.IO.Path.Combine(destDir, System.IO.Path.GetFileName(file));
                System.IO.File.Copy(file, destFile, true);
            }
            
            // Recursively copy subdirectories
            foreach (string dir in System.IO.Directory.GetDirectories(sourceDir))
            {
                string destSubDir = System.IO.Path.Combine(destDir, System.IO.Path.GetFileName(dir));
                CopyDirectory(dir, destSubDir, session);
            }
        }

        [CustomAction]
        public static ActionResult copySettingsFileToUserhome(Session session)
        {
            session.Log("Begin copySettingsFileToUserhome");

            try
            {
                string sourceFile = System.IO.Path.Combine(
                    session["CommonAppDataFolder"],
                    "WSO2 Integrator",
                    "settings.json");
                    
                if (!System.IO.File.Exists(sourceFile))
                {
                    session.Log($"Source settings.json not found: {sourceFile}");
                    return ActionResult.Failure;
                }

                var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_UserProfile WHERE Special = False");

                using (PrincipalContext context = new PrincipalContext(ContextType.Machine))
                {
                    foreach (ManagementObject profile in searcher.Get())
                    {
                        string localPath = (string)profile["LocalPath"];
                        if (string.IsNullOrEmpty(localPath)) continue;

                        int lastBackslash = localPath.LastIndexOf('\\');
                        if (lastBackslash == -1)
                        {
                            session.Log($"Invalid localPath format: {localPath}");
                            continue;
                        }
                        string username = localPath.Substring(lastBackslash + 1);
                        var user = UserPrincipal.FindByIdentity(context, username);

                        if (user == null || user.Enabled == false)
                        {
                            continue;
                        }

                        session.Log($"User directory: {localPath}");
                        string appDataRoaming = System.IO.Path.Combine(localPath, "AppData", "Roaming");
                        if (System.IO.Directory.Exists(appDataRoaming))
                        {
                            session.Log($"AppData\\Roaming directory found: {appDataRoaming}");
                            string targetDir = System.IO.Path.Combine(appDataRoaming, "WSO2 Integrator", "User");
                            if (!System.IO.Directory.Exists(targetDir))
                            {
                                System.IO.Directory.CreateDirectory(targetDir);
                            }
                            string targetFile = System.IO.Path.Combine(targetDir, "settings.json");
                            session.Log($"Copying settings.json to: {targetFile}");
                            System.IO.File.Copy(sourceFile, targetFile, true);
                            session.Log($"Copied settings.json to: {targetFile}");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                session.Log($"Error copying settings.json: {ex}");
                session.Log($"Stack trace: {ex.StackTrace}");
                session.Log("Settings file copy failed - installation will be rolled back");
                return ActionResult.Failure;
            }

            return ActionResult.Success;
        }

        [CustomAction]
        public static ActionResult clearCurrentActiveBallerinaVersion(Session session)
        {
            session.Log("Begin clearCurrentActiveBallerinaVersion");

            try
            {
                CustomActionData customData = session.CustomActionData;
                string ballerinaVersion = customData["BALLERINA_VERSION"];
                session.Log($"Ballerina version from CustomActionData: {ballerinaVersion}");

                var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_UserProfile WHERE Special = False");

                using (PrincipalContext context = new PrincipalContext(ContextType.Machine))
                {
                    foreach (ManagementObject profile in searcher.Get())
                    {
                        string localPath = (string)profile["LocalPath"];
                        if (string.IsNullOrEmpty(localPath)) continue;

                        int lastBackslash = localPath.LastIndexOf('\\');
                        if (lastBackslash == -1)
                        {
                            session.Log($"Invalid localPath format: {localPath}");
                            continue;
                        }
                        string username = localPath.Substring(lastBackslash + 1);
                        var user = UserPrincipal.FindByIdentity(context, username);

                        if (user == null || user.Enabled == false)
                        {
                            continue;
                        }

                        session.Log($"User directory: {localPath}");
                        string ballerinaUserHome = System.IO.Path.Combine(localPath, ".ballerina");
                        
                        // Delete ballerina-home directory if exists
                        try
                        {
                            string ballerinaHomeDir = System.IO.Path.Combine(ballerinaUserHome, "ballerina-home");
                            if (System.IO.Directory.Exists(ballerinaHomeDir))
                            {
                                System.IO.Directory.Delete(ballerinaHomeDir, true);
                                session.Log($"Deleted ballerina-home directory for user: {username}");
                            }
                        }
                        catch (Exception deleteEx)
                        {
                            session.Log($"Warning: Could not delete ballerina-home for {username}: {deleteEx.Message}");
                        }
                    }
                }
                
                // Update ballerina-version file in each user's home directory
                using (PrincipalContext context = new PrincipalContext(ContextType.Machine))
                {
                    foreach (ManagementObject profile in searcher.Get())
                    {
                        string localPath = (string)profile["LocalPath"];
                        if (string.IsNullOrEmpty(localPath)) continue;

                        int lastBackslash = localPath.LastIndexOf('\\');
                        if (lastBackslash == -1) continue;
                        
                        string username = localPath.Substring(lastBackslash + 1);
                        var user = UserPrincipal.FindByIdentity(context, username);

                        if (user == null || user.Enabled == false) continue;

                        string ballerinaUserHome = System.IO.Path.Combine(localPath, ".ballerina");
                        
                        // Create .ballerina directory if it doesn't exist
                        if (!System.IO.Directory.Exists(ballerinaUserHome))
                        {
                            System.IO.Directory.CreateDirectory(ballerinaUserHome);
                        }
                        
                        string ballerinaVersionFile = System.IO.Path.Combine(ballerinaUserHome, "ballerina-version");
                        
                        // Write ballerina-version file (overwrites existing)
                        System.IO.File.WriteAllText(ballerinaVersionFile, $"ballerina-{ballerinaVersion}");
                        session.Log($"Set ballerina-version to ballerina-{ballerinaVersion} for user: {username}");
                    }
                }
            }
            catch (Exception ex)
            {
                session.Log($"Error setting Ballerina version: {ex}");
                session.Log($"Stack trace: {ex.StackTrace}");
                session.Log("Ballerina version configuration failed - installation will be rolled back");
                return ActionResult.Failure;
            }

            return ActionResult.Success;
        }

        [CustomAction]
        public static ActionResult checkBallerinaInstallation(Session session)
        {
            session.Log("Begin checkBallerinaInstallation");
            try
            {
                bool ballerinaSwanLakeFound = false;
                using (var softwareKey = Microsoft.Win32.Registry.CurrentUser.OpenSubKey("Software"))
                {
                    if (softwareKey != null)
                    {
                        string[] subKeyNames = softwareKey.GetSubKeyNames();
                        foreach (var subKey in subKeyNames)
                        {
                            if (subKey.StartsWith("Ballerina", StringComparison.OrdinalIgnoreCase) && subKey.EndsWith("swan-lake", StringComparison.OrdinalIgnoreCase))
                            {
                                ballerinaSwanLakeFound = true;
                                session.Log($"Found Ballerina Swan Lake registry key: {subKey}");
                                break;
                            }
                        }
                    }
                    else
                    {
                        session.Log("Could not open HKCU\\Software registry key.");
                    }
                }
                if (ballerinaSwanLakeFound)
                {
                    session.Log("Setting BALLERINA_INSTALLATION_WARNING to 1");
                    session.Log($"BALLERINA_INSTALLATION_WARNING value: {session["BALLERINA_INSTALLATION_WARNING"]}");
                    session["BALLERINA_INSTALLATION_WARNING"] = "1";
                    session.Log($"BALLERINA_INSTALLATION_WARNING value: {session["BALLERINA_INSTALLATION_WARNING"]}");
                }
                else
                {
                    session.Log("No Ballerina Swan Lake registry key found.");
                }
            }
            catch (Exception ex)
            {
                session.Log($"Error listing registry keys: {ex}");
                return ActionResult.Failure;
            }

            return ActionResult.Success;
        }

    }
}
