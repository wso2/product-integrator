Name:           wso2-integrator
Version:        @VERSION@
Release:        @RELEASE@
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
mkdir -p %{buildroot}/usr/share/applications
mkdir -p %{buildroot}/usr/share/appdata
mkdir -p %{buildroot}/usr/share/bash-completion/completions
mkdir -p %{buildroot}/usr/share/mime/packages
mkdir -p %{buildroot}/usr/share/pixmaps
mkdir -p %{buildroot}/usr/bin

# Copy application files (includes components/ballerina, components/dependencies, components/icp)
cp -r usr/share/wso2-integrator/* %{buildroot}/usr/share/wso2-integrator/

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
find %{buildroot}/usr/share/wso2-integrator/components/ballerina/bin -type f -exec chmod +x {} \; 2>/dev/null || true
chmod +x %{buildroot}/usr/share/wso2-integrator/components/icp/bin/ciphertool.sh 2>/dev/null || true
chmod +x %{buildroot}/usr/share/wso2-integrator/components/icp/bin/dashboard.sh 2>/dev/null || true
chmod +x %{buildroot}/usr/share/wso2-integrator/components/icp/bin/update_tool_setup.sh 2>/dev/null || true

%clean
rm -rf %{buildroot}

%post
# Change ownership and permissions for integrator files
chown -R root:root /usr/share/wso2-integrator
chmod -R o+w /usr/share/wso2-integrator/components/icp/bin/database/ 2>/dev/null || true
chmod -R o+rwx /usr/share/wso2-integrator/components/icp/www/public/ 2>/dev/null || true
chmod 4755 /usr/share/wso2-integrator/chrome-sandbox 2>/dev/null || true

# Create symlink to /usr/bin
rm -f /usr/bin/wso2-integrator
ln -s /usr/share/wso2-integrator/bin/wso2-integrator /usr/bin/wso2-integrator

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

%preun
# Remove from alternatives system
if /usr/sbin/update-alternatives --display editor >/dev/null 2>&1; then
    /usr/sbin/update-alternatives --remove editor /usr/bin/wso2-integrator || true
fi

%postun
# Remove symlinks
rm -f /usr/bin/wso2-integrator

# Remove environment variable file
rm -f /etc/profile.d/wso2.sh

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