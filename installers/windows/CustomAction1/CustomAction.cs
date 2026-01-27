using System;
using System.Collections.Generic;
using System.DirectoryServices.AccountManagement;
using System.Linq;
using System.Management;
using WixToolset.Dtf.WindowsInstaller;

namespace CustomAction1
{
    public class CustomActions
    {
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
                            
                            // Delete all ballerina-version files recursively
                            try
                            {
                                var versionFiles = System.IO.Directory.GetFiles(ballerinaUserHome, "ballerina-version", System.IO.SearchOption.AllDirectories);
                                foreach (var file in versionFiles)
                                {
                                    System.IO.File.Delete(file);
                                    session.Log($"Deleted ballerina-version file: {file}");
                                }
                                session.Log($"Deleted ballerina-version files for user: {username}");
                            }
                            catch (Exception deleteEx)
                            {
                                session.Log($"Error deleting ballerina-version files for {username}: {deleteEx.Message}");
                            }
                        }
                    }
                }
                
                // Set the integrator version as active ballerina version in system-wide location
                if (!string.IsNullOrEmpty(ballerinaVersion))
                {
                    string systemBalVersionFile = System.IO.Path.Combine(ballerinaInstallPath, "distributions", "ballerina-version");
                    string distributionsDir = System.IO.Path.Combine(ballerinaInstallPath, "distributions");
                    
                    // Create distributions directory if it doesn't exist
                    if (!System.IO.Directory.Exists(distributionsDir))
                    {
                        System.IO.Directory.CreateDirectory(distributionsDir);
                    }
                    
                    // Remove existing ballerina-version file if it exists
                    if (System.IO.File.Exists(systemBalVersionFile))
                    {
                        System.IO.File.Delete(systemBalVersionFile);
                        session.Log("Removed existing system-wide ballerina-version file");
                    }
                    
                    // Write version to system-wide location
                    System.IO.File.WriteAllText(systemBalVersionFile, ballerinaVersion);
                    session.Log($"Set system-wide ballerina-version to {ballerinaVersion}");
                }
                else
                {
                    session.Log("No Ballerina version found, skipping system-wide version file update");
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
