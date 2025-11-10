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
mkdir -p %{buildroot}/usr/share/zsh/vendor-completions
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
if [ -d usr/share/zsh/vendor-completions ]; then
    cp usr/share/zsh/vendor-completions/* %{buildroot}/usr/share/zsh/vendor-completions/ 2>/dev/null || true
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


set_curr_bal_active() {
    local user_home=$1
    local username=$2
    local user_ballerina_dir="$user_home/.ballerina"
    
    if [ ! -d "$user_home" ] || [ "$user_home" = "/" ]; then
        return
    fi
    
    if [ ! -d "$user_ballerina_dir" ]; then
       return
    fi

    user_bal_version_file="$user_ballerina_dir/ballerina-version"
    rm -f "$user_bal_version_file"
    echo "Removed ballerina-version file for user: $USERNAME"
}

while IFS=: read -r username _ uid _ _ home _; do
    if [ "$uid" -ge 1000 ] && [ "$username" != "nobody" ]; then
        set_curr_bal_active "$home" "$username"
    fi
done < /etc/passwd 2>/dev/null || true

# Set up for root user
if [ -d "/root" ]; then
    set_curr_bal_active "/root" "root"
fi

%preun
# Remove from alternatives system
/usr/sbin/update-alternatives --remove editor /usr/bin/wso2-integrator 2>/dev/null || true

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
/usr/share/zsh/vendor-completions/*
/usr/share/mime/packages/*
/usr/share/pixmaps/*
/usr/lib64/ballerina/*
/usr/lib64/wso2/icp/*