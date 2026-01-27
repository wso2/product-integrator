Name:           wso2-integrator
Version:        @VERSION@
Release:        1
Summary:        WSO2 Integrator - Low Code Integration
License:        MIT
URL:            https://wso2.com/integration/
Source0:        %{name}-%{version}.tar.gz

AutoReqProv: no

%description
WSO2 Integrator is a comprehensive integration development environment
that brings together Ballerina language runtime, WSO2 Integration Control Plane,
and low-code editor in one unified package.

%global debug_package %{nil}
%prep
%setup -q -c

%build

%install
rm -rf %{buildroot}

# Create directory structure
mkdir -p %{buildroot}/usr/share/wso2-integrator
mkdir -p %{buildroot}/usr/lib64/ballerina
mkdir -p %{buildroot}/usr/lib64/wso2/icp
mkdir -p %{buildroot}/usr/share/applications
mkdir -p %{buildroot}/usr/share/appdata
mkdir -p %{buildroot}/usr/share/bash-completion/completions
mkdir -p %{buildroot}/usr/share/mime/packages
mkdir -p %{buildroot}/usr/share/pixmaps
mkdir -p %{buildroot}/usr/bin

# Copy application files
cp -r usr/share/wso2-integrator/* %{buildroot}/usr/share/wso2-integrator/
cp -r usr/lib64/ballerina/* %{buildroot}/usr/lib64/ballerina/
cp -r usr/lib64/wso2/icp/* %{buildroot}/usr/lib64/wso2/icp/

# Copy desktop and system integration files (if they exist)
if [ -d usr/share/applications ]; then
    cp usr/share/applications/*.desktop %{buildroot}/usr/share/applications/ 2>/dev/null || true
fi
if [ -d usr/share/appdata ]; then
    cp usr/share/appdata/*.xml %{buildroot}/usr/share/appdata/ 2>/dev/null || true
fi
if [ -d usr/share/mime/packages ]; then
    cp usr/share/mime/packages/* %{buildroot}/usr/share/mime/packages/ 2>/dev/null || true
fi
if [ -d usr/share/pixmaps ]; then
    cp usr/share/pixmaps/* %{buildroot}/usr/share/pixmaps/ 2>/dev/null || true
fi
if [ -d usr/share/bash-completion/completions ]; then
    cp usr/share/bash-completion/completions/* %{buildroot}/usr/share/bash-completion/completions/ 2>/dev/null || true
fi

# Ensure executable permissions
chmod +x %{buildroot}/usr/share/wso2-integrator/bin/wso2-integrator
chmod +x %{buildroot}/usr/share/wso2-integrator/wso2-integrator
chmod +x %{buildroot}/usr/lib64/ballerina/bin/bal
chmod +x %{buildroot}/usr/lib64/wso2/icp/bin/ciphertool.sh
chmod +x %{buildroot}/usr/lib64/wso2/icp/bin/dashboard.sh
chmod +x %{buildroot}/usr/lib64/wso2/icp/bin/update_tool_setup.sh

%clean
rm -rf %{buildroot}

%post
# Create symlink to /usr/bin
rm -f /usr/bin/wso2-integrator
ln -s /usr/share/wso2-integrator/bin/wso2-integrator /usr/bin/wso2-integrator
ln -s /usr/lib64/ballerina/bin/bal /usr/bin/bal
echo 'export BALLERINA_HOME=/usr/lib64/ballerina' >> /etc/profile.d/wso2.sh
chmod 0755 /etc/profile.d/wso2.sh

# Register in alternatives system
/usr/sbin/update-alternatives --install /usr/bin/editor editor /usr/bin/wso2-integrator 0 2>/dev/null || true

# Update desktop database
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database 2>/dev/null || true
fi

# Update MIME database
if command -v update-mime-database >/dev/null 2>&1; then
    update-mime-database /usr/share/mime 2>/dev/null || true
fi

# Read Ballerina version from the version file
BALLERINA_VERSION=""
if [ -f "/usr/lib64/ballerina/ballerina_version" ]; then
    BALLERINA_VERSION=$(cat "/usr/lib64/ballerina/ballerina_version")
fi

# Check if Ballerina needs to be installed
if [ -n "$BALLERINA_VERSION" ] && [ -d "/usr/lib64/ballerina/distributions/ballerina-$BALLERINA_VERSION" ]; then
    echo "Ballerina version $BALLERINA_VERSION already exists - skipping extraction"
else
    echo "Installing Ballerina version $BALLERINA_VERSION"
    
    # Extract Ballerina from the bundled zip
    BALLERINA_ZIP="/usr/lib64/ballerina/ballerina.zip"
    if [ -f "$BALLERINA_ZIP" ]; then
        TEMP_EXTRACT="/tmp/wso2_ballerina_extract_$$"
        mkdir -p "$TEMP_EXTRACT"
        
        echo "Extracting Ballerina zip..."
        unzip -q "$BALLERINA_ZIP" -d "$TEMP_EXTRACT"
        
        # Get the extracted folder name
        BALLERINA_FOLDER=$(ls -1 "$TEMP_EXTRACT" | head -1)
        
        # Move extracted contents to /usr/lib64/ballerina
        echo "Installing Ballerina to /usr/lib64/ballerina..."
        cp -R "$TEMP_EXTRACT/$BALLERINA_FOLDER"/* /usr/lib64/ballerina/
        
        # Cleanup
        rm -rf "$TEMP_EXTRACT"
        rm -f "$BALLERINA_ZIP"
        echo "Ballerina installation completed"
    else
        echo "Warning: Ballerina zip not found at $BALLERINA_ZIP"
    fi
fi

# Clean up the version and zip files after use
rm -f /usr/lib64/ballerina/ballerina_version

# Delete ballerina-home from user homes
delete_user_bal_home() {
    local user_home=$1
    local username=$2
    local user_ballerina_dir="$user_home/.ballerina"
    
    if [ ! -d "$user_home" ] || [ "$user_home" = "/" ]; then
        return
    fi
    
    if [ -d "$user_ballerina_dir" ]; then
        rm -rf "$user_ballerina_dir/ballerina-home" 2>/dev/null || true
        echo "Deleted ballerina-home for user: $username"
    fi
}

while IFS=: read -r username _ uid _ _ home _; do
    if [ "$uid" -ge 1000 ] && [ "$username" != "nobody" ]; then
        delete_user_bal_home "$home" "$username"
    fi
done < /etc/passwd 2>/dev/null || true

# Delete for root user
if [ -d "/root" ]; then
    delete_user_bal_home "/root" "root"
fi

# Read Ballerina version from the version file
BALLERINA_VERSION=""
if [ -f "/usr/lib64/ballerina/ballerina_version" ]; then
    BALLERINA_VERSION=$(cat "/usr/lib64/ballerina/ballerina_version")
    
    # Update ballerina-version file in each user's home directory
    set_user_bal_version() {
        local user_home=$1
        local username=$2
        local user_ballerina_dir="$user_home/.ballerina"
        
        if [ ! -d "$user_home" ] || [ "$user_home" = "/" ]; then
            return
        fi
        
        # Create .ballerina directory if it doesn't exist
        mkdir -p "$user_ballerina_dir"
        
        local user_bal_version_file="$user_ballerina_dir/ballerina-version"
        
        # Remove existing ballerina-version file if it exists
        if [ -f "$user_bal_version_file" ]; then
            rm -f "$user_bal_version_file"
        fi
        
        echo "ballerina-$BALLERINA_VERSION" > "$user_bal_version_file"
        chown "$username":"$username" "$user_bal_version_file" 2>/dev/null || true
        echo "Set ballerina-version to ballerina-$BALLERINA_VERSION for user: $username"
    }
    
    while IFS=: read -r username _ uid _ _ home _; do
        if [ "$uid" -ge 1000 ] && [ "$username" != "nobody" ]; then
            set_user_bal_version "$home" "$username"
        fi
    done < /etc/passwd 2>/dev/null || true
    
    # Set for root user
    if [ -d "/root" ]; then
        set_user_bal_version "/root" "root"
    fi
fi

%preun
# Remove from alternatives system
if update-alternatives --display editor >/dev/null 2>&1; then
	update-alternatives --remove editor /usr/bin/wso2-integrator || true
fi

%postun
# Remove symlink
rm -f /usr/bin/wso2-integrator


# Update desktop database
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database 2>/dev/null || true
fi

# Update MIME database
if command -v update-mime-database >/dev/null 2>&1; then
    update-mime-database /usr/share/mime 2>/dev/null || true
fi

%files
/usr/share/wso2-integrator/*
/usr/share/applications/*
/usr/share/appdata/*
/usr/share/bash-completion/completions/*
/usr/share/mime/packages/*
/usr/share/pixmaps/*
/usr/lib64/ballerina/*
/usr/lib64/wso2/icp/*