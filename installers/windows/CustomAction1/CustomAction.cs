using System;
using System.Collections.Generic;
using System.DirectoryServices.AccountManagement;
using System.IO.Compression;
using System.Linq;
using System.Management;
using WixToolset.Dtf.WindowsInstaller;

namespace CustomAction1
{
    public class CustomActions
    {
        [CustomAction]
        public static ActionResult extractBallerinaConditionally(Session session)
        {
            session.Log("Begin extractBallerinaConditionally");

            try
            {
                // Read Ballerina version from the bundled resource
                string installDir = session["INSTALLFOLDER"];
                string ballerinaInstallPath = System.IO.Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    "Ballerina");
                
                // The zip and version file are embedded as Binary resources in WiX
                // We'll extract them to temp first
                string tempDir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "wso2_ballerina_install_" + Guid.NewGuid().ToString());
                System.IO.Directory.CreateDirectory(tempDir);
                
                try
                {
                    // Extract Binary resources from the MSI
                    string ballerinaZipPath = System.IO.Path.Combine(tempDir, "ballerina.zip");
                    string versionFilePath = System.IO.Path.Combine(tempDir, "ballerina_version.txt");
                    
                    // Extract the Binary resources
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
                        }
                    }
                    
                    if (!System.IO.File.Exists(versionFilePath))
                    {
                        session.Log("Ballerina version file not found in resources");
                        return ActionResult.Success; // Don't fail the installation
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
                        session.Log($"Ballerina zip not found at {ballerinaZipPath}");
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
                        session.Log("No ballerina-* directory found in extracted contents");
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
                // Read Ballerina version from the version file
                string ballerinaInstallPath = System.IO.Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    "Ballerina");
                string ballerinaVersion = null;
                string versionFilePath = System.IO.Path.Combine(ballerinaInstallPath, "ballerina_version");
                
                if (System.IO.File.Exists(versionFilePath))
                {
                    ballerinaVersion = System.IO.File.ReadAllText(versionFilePath).Trim();
                    session.Log($"Read Ballerina version from file: {ballerinaVersion}");
                }
                else
                {
                    session.Log($"Ballerina version file not found: {versionFilePath}");
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
                        string ballerinaUserHome = System.IO.Path.Combine(localPath, ".ballerina");
                        if (System.IO.Directory.Exists(ballerinaUserHome))
                        {
                            session.Log($"Ballerina user home directory found: {ballerinaUserHome}");
                            
                            // Delete ballerina-home directory
                            try
                            {
                                string ballerinaHomeDir = System.IO.Path.Combine(ballerinaUserHome, "ballerina-home");
                                if (System.IO.Directory.Exists(ballerinaHomeDir))
                                {
                                    System.IO.Directory.Delete(ballerinaHomeDir, true);
                                    session.Log($"Deleted ballerina-home directory: {ballerinaHomeDir}");
                                }
                            }
                            catch (Exception deleteEx)
                            {
                                session.Log($"Error deleting ballerina-home for {username}: {deleteEx.Message}");
                            }
                        }
                    }
                }
                
                // Update ballerina-version file in each user's home directory
                if (!string.IsNullOrEmpty(ballerinaVersion))
                {
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
                            
                            // Remove existing ballerina-version file if it exists
                            if (System.IO.File.Exists(ballerinaVersionFile))
                            {
                                System.IO.File.Delete(ballerinaVersionFile);
                            }
                            
                            System.IO.File.WriteAllText(ballerinaVersionFile, $"ballerina-{ballerinaVersion}");
                            session.Log($"Set ballerina-version to ballerina-{ballerinaVersion} for user: {username}");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                session.Log($"Error setting Ballerina version: {ex}");
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
