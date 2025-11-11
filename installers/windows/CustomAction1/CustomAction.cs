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
                    //return ActionResult.Failure;
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
                var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_UserProfile WHERE Special = False");

                using (PrincipalContext context = new PrincipalContext(ContextType.Machine))
                {
                    foreach (ManagementObject profile in searcher.Get())
                    {
                        string localPath = (string)profile["LocalPath"];
                        if (string.IsNullOrEmpty(localPath)) continue;

                        string username = localPath.Substring(localPath.LastIndexOf('\\') + 1);
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
                            string ballerinaVersionFile = System.IO.Path.Combine(ballerinaUserHome, "ballerina-version");
                            if (System.IO.File.Exists(ballerinaVersionFile))
                            {
                                System.IO.File.Delete(ballerinaVersionFile);
                                session.Log($"Deleted ballerina-version file: {ballerinaVersionFile}");
                            }
                            else
                            {
                                session.Log($"ballerina-version file not found: {ballerinaVersionFile}");
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                session.Log($"Error clearing Ballerina version: {ex}");
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
