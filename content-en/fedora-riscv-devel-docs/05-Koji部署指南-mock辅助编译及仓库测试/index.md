---
title: "Building with mock and testing repositories"
slug: mock-build-and-repo-testing
date: 2024-09-10T00:00:00+00:00
translation: machine
sourceHash: "1e1e367d6e651c5f3969a9809bd1ed70"
---

<div align='center' ><font size='20'>Mock-Assisted Builds and Repository Testing</font></div>

![img](./5.1.png)

The most direct way to build an RPM package is to run the rpmbuild command on the local machine, which uses the local dependency packages and any local modifications to related packages. However, an official package build must use a "clean" environment: dependencies are downloaded and installed directly from the standard repositories through dnf, and a pure build environment is constructed without any modification. For this purpose, the mock command can be used instead of rpmbuild to build software.

Mock is a tool for building packages. It can build packages for architectures different from the host and for versions of [Fedora](https://getfedora.org/), [RHEL](https://www.redhat.com/en/technologies/linux-platforms/enterprise-linux) and [Mageia](https://www.mageia.org/) different from the host. Mock creates chroots and builds packages inside them. Its only job is to reliably set up a chroot and try to build a package in it.

Mock also provides a multi-package build command (--chain), which can build a series of packages that depend on one another.

If the mock-scm package is installed on the system, Mock can build SRPMs through __Source Configuration Management__ (SCM). See --scm-enable in the documentation.

# Introduction

- Mock is a wrapper around rpmbuild; its purpose is to simplify the tedious build preparation steps.
- Mock runs rpmbuild in an isolated environment containing a minimal set of packages.
- Mock helps you install the required BuildRequires - if it cannot find a required package, the build fails.
- Mock can build packages for different platforms and architectures. Some combinations of host and target may need additional configuration files, depending on the host platform you use.
- Mock prepares a brand-new build/development environment for a specific RPM-based OS.
- Mock needs root privileges for some tasks, so a malicious RPM package may threaten your system. Mock is not safe for unknown RPM packages. If you want to build RPM packages from untrusted sources, you can use a wrapper around mock, such as OBS, Copr, or a virtual machine running Mock.
- Mock is neither a container nor a virtual machine. Mock provides some isolation, but not complete isolation. Mock can open a shell in the build environment (buildroot) for you to inspect the contents or run some commands for debugging the build. So it is not suitable for any production environment or for application developers; for other needs you can use podman or Flatpak.

**The steps to set up a mock environment are as follows:**

# Installation

If you want to contribute code, see https://github.com/rpm-software-management/mock.

Otherwise you only need to run:

```shell
sudo dnf install mock
```

For the latest continuous-integration builds, see the [developer documentation](https://github.com/rpm-software-management/mock).

- Note: cross-platform builds require qemu-user-static to be installed:

```shell
sudo dnf install qemu-user-static
```

# Configuration

Every user who wants to use mock must be added to the mock group.

```shell
sudo usermod -a -G mock [User name]
```

__Warning:__ Some of the code Mock runs requires root privileges. There are several known ways to obtain root access as long as the user is in the mock group (and only such a user can run mock). This may make it possible for a user to abuse the mock configuration options. Do not add any untrusted user to the mock group!

__Note:__ The above takes effect only after the user logs in again or runs the "newgrp -" command.

Mock caches downloaded rpm packages (through the yum_cache plugin), which can greatly speed up subsequent builds. You can also speed things up by adding a local repository to the default configuration.

With the default configuration, __all build results are saved in /var/lib/mock__, so make sure this directory has enough space for building. You can also point it to another directory with the "basedir" configuration option.

# Configuration File Analysis

Mock configuration files can be logically divided into the __general configuration__ (used for every mock execution) and the __chroot configuration__ (used only for the specified chroot, see below).

Both the general configuration and the chroot configuration can be written in the system configuration (the /etc/mock directory) or the user configuration (files in the $HOME/.config directory).

The Mock project provides the "mock-core-configs" package, which contains the default [configuration files](https://rpm-software-management.github.io/mock/configuration) for various RPM-based Linux distributions. This package is usually installed together with Mock (as a runtime dependency). Other projects can provide configuration files through additional packages, for example:

- [mock-centos-sig-configs](https://pagure.io/centos-sig-hyperscale/mock-centos-sig-configs)

## Specifying a chroot configuration file

For example, to initialize a Fedora Rawhide x86_64 chroot (using the file /etc/mock/fedora-rawhide-x86_64.cfg) and switch into the chroot (its shell environment), do the following:

```shell
$ mock -r fedora-rawhide-x86_64 --shell
```

Note that here we did not give the .cfg suffix in the -r argument. **In this case, the relevant .cfg file in the user's $HOME/.config directory is searched for first; if it is not found, the file in the system configuration directory /etc/mock is searched for (and used).**

A configuration file path can also be used in the "-r" option. But the path must name an existing file (accessible from the current working directory), **and it must end with the '.cfg' suffix**:

```shell
$ mock -r ./subdir/existing-config-file.cfg --shell
$ mock -r /etc/mock/fedora-35-x86_64.cfg
```

## Adjusting the general configuration

Normally, the __$HOME/.config/mock.cfg__ file should be used for general configuration changes for a single user. To change Mock's behavior for the whole system (for all users of the system), use /etc/mock/site-defaults.cfg.

Normally the site-defaults.cfg file is empty by default, containing only basic documentation and a valid link to the full configuration documentation. That documentation is usually __/usr/share/doc/mock/site-defaults.cfg __ (the location may differ depending on your host system).

## Adjusting the chroot configuration

The chroot configuration files for the various build environments, /etc/mock/.cfg, contain various compatibility settings related to the target distribution (including the RPM repository addresses used with DNF or YUM, the working directories used, and so on). These system files are shipped through [mock-core-configs](https://src.fedoraproject.org/rpms/mock-core-configs) (or other packages), and users are discouraged from changing their contents (it may cause problems when these files are updated automatically along with the package).

It is safer to override their contents in the following way:

```shell
$ cat $HOME/.config/mock/fedora-35-x86_64.cfg
# include the default configuration
include("/etc/mock/fedora-35-x86_64.cfg")
# install make into the minimal build chroot
config_opts['chroot_additional_packages'] = 'make'
```

You can also copy an existing configuration file and edit it into a new configuration file:

```shell
$ cp /etc/mock/fedora-rawhide-x86_64.cfg ~/.config/mock/foo.cfg
```

If a required configuration already exists in Koji, you can generate this configuration file with the Koji command-line tool:

```shell
$ koji mock-config --tag f21-build --arch=aarch64 f21 > ~/.config/mock/foo.cfg
```

The same functionality also exists in the Copr command-line tool:

```shell
$ copr mock-config @copr/copr-dev fedora-21-x86_64 > ~/.config/mock/foo.cfg
```

Once the configuration file is installed, you can run:

```shell
mock -r foo [...].
```

## Configuration import order

The import and override order of configuration files in Mock is as follows ([related code](https://github.com/rpm-software-management/mock/blob/main/mock/py/mockbuild/config.py)):

1. Global configuration (the default files contain no effective configuration; they are documentation files):
   1. General configuration: /etc/mock/site-defaults.cfg
   2. chroot configuration: /etc/mock/chroot-aliases.cfg
2. chroot configuration (in order of priority, __choose one of three__):
   1. A file whose path is given on the command line and which has the `.cfg` suffix
   2. User configuration: ~/.config/mock/.cfg
   3. Global configuration: /etc/mock/.cfg
3. User-specific configuration:
   1. ~/.mock/user.cfg
   2. ~/.config/mock.cfg (since mock-1.2.15)

**Values in configuration files imported later override those imported earlier.**

# qemu user mode Mock build configuration

## Released version

For example, to build riscv64 rpm packages for Fedora 37, the configuration file is as follows:

**/etc/mock/fedora-37-riscv64.cfg**

For the RawHide version it is __(the rawhide version at the time of writing is 38)__:

**/etc/mock/fedora-38-riscv64.cfg**

```shell
config_opts['releasever'] = '37'
config_opts['target_arch'] = 'riscv64'
config_opts['legal_host_arches'] = ('riscv64',)
config_opts['qemu_user_static_mapping'] = {'riscv64': 'riscv64',}

include('templates/fedora-branched.tpl')
```

## Rawhide

For the RawHide version it is (****the rawhide version at the time of writing is 38****):

/etc/mock/fedora-****rawhide****-****riscv64****.cfg

```shell
config_opts['target_arch'] = 'riscv64'
config_opts['legal_host_arches'] = ('riscv64',)
config_opts['qemu_user_static_mapping'] = {'riscv64': 'riscv64',}

include('templates/fedora-rawhide.tpl')
```

Then create a symbolic link for the current rawhide version:

```shell
sudo ln -sf fedora-rawhide-riscv64.cfg  /etc/mock/fedora-38-riscv64.cfg
```

Note: the mapping between rawhide and the actual version number is all implemented through symbolic links, for example: **/etc/mock/fedora-38-riscv64.cfg -> fedora-rawhide-riscv64.cfg**

For architectures not yet officially supported by the mainline (such as riscv64 in the example), the repository configuration contained in the files under templates may not be sufficient for building. In this case, according to the configuration import order, the files under "User-specific configuration:" need to be modified, overriding the previously imported information with the correct repository information. For example:

**Contents of ~/.mock/user.cfg or ~/.config/mock.cfg:**

```shell
include('/etc/mock/templates/fedora-riscv64-repo.tpl')
```

**Contents of /etc/mock/templates/fedora-37-riscv64-repo.tpl:**

```shell
config_opts['bootstrap_image'] = ''

config_opts['dnf.conf'] = """
[main]
keepcache=1
debuglevel=2
reposdir=/dev/null
logfile=/var/log/yum.log
retries=20
obsoletes=1
gpgcheck=0
assumeyes=1
syslog_ident=mock
syslog_device=
install_weak_deps=0
metadata_expire=0
best=1
module_platform_id=platform:f{{ releasever }}
protected_packages=
user_agent={{ user_agent }}

# repos

[fedora-{{ releasever }}-dist-riscv]
name=Fedora {{ releasever }} RISC-V dist on OpenKoji
baseurl=https://openkoji.iscas.ac.cn/repos/fc{{ releasever }}dist/$basearch/
cost=1000
enabled=1
skip_if_unavailable=False

[fedora-36-dev-riscv]
name=Fedora 36 RISC-V dev on OpenKoji
baseurl=https://openkoji.iscas.ac.cn/repos/fc36dev/$basearch/
cost=2000
enabled=1
skip_if_unavailable=True

[fedora-36-dev-riscv-source]
name=Fedora 36 RISC-V dev on OpenKoji - Source
baseurl=https://openkoji.iscas.ac.cn/repos/fc36dev/src/
cost=2000
enabled=0
skip_if_unavailable=True
"""
```

# Reference Build Procedure

## Setting the build environment variables

rpm_build_tools.conf

```shell
MOCK_CONFIG=fedora-rawhide-riscv64
WORK_DIR=/mnt/development/RISC-V/rpm_packaging/${MOCK_CONFIG}
LOCAL_REPO=/mnt/development/RISC-V/rpm_packaging/${MOCK_CONFIG}-localrepo/
GIT_REPO_BASE=git@gitee.com:src-oepkgs-fedora-rv
GIT_REPO_BASE_SSH=git+ssh://git@gitee.com/src-oepkgs-fedora-rv
DEVEL_REMOTE=origin
DEVEL_BRANCH_ORG=rawhide
DEVEL_BRANCH=f38_riscv64
CMT_MESSAGE='Add source code tarball to repo.'
#for koji build
BUILD_TARGET=f38dev
BUILD_TAG=f38dev
```

## Building RPMs

### Building from the srpm repository

1. Modify the configuration file ~/.mock/user.cfg
   
   Add the base address of the git repository; see the configuration adjustments for SCM for details:
   
   ```shell
   include('/etc/mock/templates/fedora-38-riscv64-repo.tpl')
   
   config_opts['scm_opts']['git_get'] = 'git clone SCM_BRN git@gitee.com:src-oepkgs-fedora-rv/SCM_PKG.git SCM_PKG'
   ```

2. Example build command (single-package build)
   
   ```shell
   PKG_NAME=${1-zlib}
   env G_SLICE=always-malloc \
   mock -r ${MOCK_CONFIG} \
   --scm-enable \
   --scm-option package=${PKG_NAME} \
   --scm-option branch=${DEVEL_BRANCH} \
   --resultdir ${WORK_DIR}/${PKG_NAME}_WS
   ```

### chain build mode

Assume our code is downloaded in the working directory: ${WORK_DIR}

```shell
mkdir -p $LOCAL_REPO $WORK_DIR
pushd $WORK_DIR


PKG_NAME=${1-zlib}
# _WS : WorkSpace
mkdir -p ${PKG_NAME}_WS


######为了保证编译顺利进行，不会因源码下载失败而出错######
######以下操作仅为了提前下载好源码######
git clone ${GIT_REPO_BASE}/${PKG_NAME}.git ${PKG_NAME}_WS/${PKG_NAME}
pushd ${PKG_NAME}_WS/${PKG_NAME}
git checkout ${DEVEL_REMOTE}/${DEVEL_BRANCH_ORG}
git checkout -b ${DEVEL_BRANCH}
fedpkg source
#若下载失败可尝试以下命令
#spectool -g ${PKG_NAME}.spec
#获取所有源码压缩文件的列表
SRC_FILE=`cat sources | awk '{printf $2}' | sed -e 's/(//g' -e 's/)/ /g'`
#强行加入git的commit中
#并删除名为source的文件，确保编译系统不在编译阶段下载源码压缩包
git add -f $SRC_FILE && git rm sources
#本地提交带源码压缩包的commit
git commit -am "$CMT_MESSAGE"
#推到远程仓库，确保之后可使用这个带源码的提交点
git push $DEVEL_REMOTE $DEVEL_BRANCH
popd
###### end ######


#先构建SRPM,然后用‘--chain’构建RPMs，解决编译依赖问题。
env G_SLICE=always-malloc \
mock -r ${MOCK_CONFIG} \
--scm-enable \
--scm-option package=${PKG_NAME} \
--scm-option branch=${DEVEL_BRANCH} \
--buildsrpm \
--resultdir ${PKG_NAME}_WS && \
env G_SLICE=always-malloc \
mock -r ${MOCK_CONFIG} \
--localrepo ${LOCAL_REPO} \
--recurse --chain \
${PKG_NAME}_WS/${PKG_NAME}*src.rpm

popd
```

- __--cleanup-after__: clean up the build site after the build finishes
- __--nocheck__: skip the final %check stage; for some riscv packages whose tests do not pass, this can temporarily produce packages to resolve dependencies.
- __-D 'dist .f36'：__ temporarily define the dist field; helpful when the rpm configuration macros are still incomplete in early stages.
- __--chain：__ accepts builds from SRPM only. "CRITICAL: You must specify an SRPM file with --chain"

If a build fails and pollutes the build environment, or the repository cache holds old packages (of the same or a lower version) that affect the build, the build environment can be cleaned with the following command.

```shell
env G_SLICE=always-malloc \
mock -r ${MOCK_CONFIG} --cleanup-after --scrub=all
```

## Handling the results after a Mock build

After the build completes, the results can be imported into a repository, for example by copying the rpms from ${__LOCAL_REPO__} to the external repo and updating the repository:

```shell
createrepo -v --update ${external_repo_path}
```

Then use

```shell
koji -q --skip-main regen-repo --nowait ${BUILD_TAG}
```

to update the repository of the corresponding tag

## Submitting tasks to koji (accounts with koji submission permission)

```shell
koji add-pkg --owner=kojiadmin ${BUILD_TARGET} $PKG_NAME;
koji build --nowait ${BUILD_TARGET} \
${GIT_REPO_BASE_SSH}/${PKG_NAME}.git#$(git rev-parse ${DEVEL_REMOTE}/${DEVEL_BRANCH})
```

# Appendix: Detailed mock Configuration [Translation and Rearrangement of site-defaults.cfg]

## Configuration file categories

__Global configuration file:__ site-defaults.cfg applies to the host and contains the defaults for all configuration; the __configuration options specified in it will be overridden by each user's own mock configuration files__.

- /etc/mock/site-defaults.cfg: the configuration file shipped with the package. By default it sets no configuration options; you only need to set things here when you want to override some defaults.
- /usr/share/doc/mock/site-defaults.cfg: an introductory documentation file.

__User configuration file__: ~/.config/mock.cfg

## Configuration file syntax

### The "include" statement

Declares inclusion of another configuration file:

**include('/path/to/included/config.cfg')**

### Configuration option format

**config_opts['foo'] = 'bar'**

Jinja templates can be used, for example: **config_opts['foobar'] = '{{ foo }} bar'**

(using the definition above) the result is __'bar bar'__ .

A more complex example:

**config_opts['foo'] = "{{ plugin_conf['package_state_enable'] }}"**

The result is "True"

## Recommended settings in the global site-defaults.cfg

### Directory settings

```shell
config_opts['basedir'] = '/var/lib/mock/'
config_opts['cache_topdir'] = '/var/cache/mock'
```

Note: the paths that basedir and cache_topdir point to must be owned by the 'mock' group and must have the permissions "g+rws"

### Timeout settings

```shell
config_opts['rpmbuild_timeout'] = 0
```

### Network settings

Using __"--enable-network"__ sets __use_host_resolv__ to __True,__ which can be changed as follows:

```shell
config_opts['use_host_resolv'] = False
```

### Logging settings

The log formats can be configured as follows; the formats corresponding to these names (keys) are taken from /etc/mock/logging.ini:

[formatters]

keys: **detailed**,**simple**,**unadorned**,**state**

```shell
config_opts['build_log_fmt_name'] = "unadorned"
config_opts['root_log_fmt_name']  = "detailed"
config_opts['state_log_fmt_name'] = "state"
```

By default, mock outputs the build log (only) to stderr (of the tty). Setting the following to True forces it to produce output (a use case: a CI build environment without a tty), or setting it to False forces output off. Commenting out this option or setting it to None gives the default behavior.

```shell
config_opts['print_main_output'] = None
```

This option sets the prefix for stderr output in the build.log file. The default is an empty string.

```shell
config_opts['stderr_line_prefix'] = ""
```

### Device node settings

mock normally sets up a minimal /dev for the chroot. To use a preconfigured /dev, disable this option and use the bind-mount plugin to mount a customized /dev.

```shell
config_opts['internal_dev_setup'] = True
```

The default maximum number of loop devices is 12

```shell
config_opts['dev_loop_count'] = 12
```

### Directory cleanup settings

The cleanup_on_* options let the system automatically clean up and delete mock's build directories, but only when used together with "--resultdir". Compared with the coarse control of the command-line options, **config_opts provides a fine-grained control mode.**

```shell
config_opts['cleanup_on_success'] = True
config_opts['cleanup_on_failure'] = True
```

To prevent garbage from the previous build from affecting the next one, even when "--no-clean" is used, the build user's homedir is still partly cleaned.

Mock can be configured not to clean certain files/directories; the default is the SOURCES directory, to support building nosrc rpms. Paths are relative to the build user's homedir build.

```shell
config_opts['exclude_from_homedir_cleanup'] = ['build/SOURCES']
```

If you need mock to back up the contents of the result directory (result dir) before cleaning, use the following configuration

```shell
config_opts['backup_on_clean'] = False
config_opts['backup_base_dir'] = "{{basedir}}/backup"
```

### Isolation mode (container-related) settings

Selects the isolation mode used to run commands in the buildroot. The possible values are 'nspawn' (mock uses systemd-nspawn(1)), 'simple' (simply uses os.chroot()) or 'auto' (use 'nspawn' if possible, otherwise fall back to 'chroot').

```shell
config_opts['isolation'] = 'auto'
```

#### 'nspawn'

If isolation='nspawn' is used, networking is disabled by default for rpmbuild, in order to ensure build reproducibility.

```shell
config_opts['rpmbuild_networking'] = False
```

The additional arguments for nspawn are

```shell
config_opts['nspawn_args'] = ['--capability=cap_ipc_lock']
```

#### hostname

When RPMs are built in a container, the hostname during the build is set to the container name. The following sets the build-time hostname to the container host's name, and applies only to F25 and later chroots.

```shell
config_opts['use_container_host_hostname'] = True
```

This setting calls sethostname() unconditionally to set the hostname, but nevertheless the variable use_container_host_hostname or the %_buildhost macro can override it.

```shell
config_opts['hostname'] = 'my.own.hostname'
```

Note: [found in testing] specifying the hostname must be used together with the following configuration:

```shell
config_opts['use_nspawn'] = False
```

#### docker_unshare_warning

By default Mock does not share the user namespace, which differs from other applications in unprivileged containers that ignore this feature. mock will display a warning message that running mock in the same container as other applications is not appropriate and carries security risks. If you are aware of the security risks, or mock is the only application in your container, the warning can be turned off with the following option.

```shell
config_opts['docker_unshare_warning'] = True
```

### Package manager settings

The default package manager is DNF.

To use DNF, set it to 'dnf'. In that case dnf and dnf-plugins-core must be installed on the system.

```shell
config_opts['package_manager'] = 'dnf'
```

The number of attempts at a package manager operation and the interval (in seconds) between attempts. This setting is used, for example, when building with an unreliable repository mirror (metadata download failures, package download failures...)

```shell
config_opts['package_manager_max_attempts'] = 1
config_opts['package_manager_attempt_delay'] = 10
```

If you need a package manager of a different version from the main system, you can set the paths of the Yum, DNF, rpm and rpmbuild executables:

```shell
config_opts['yum_command'] = '/usr/bin/yum'
config_opts['yum_builddep_command'] = '/usr/bin/yum-builddep'
config_opts['dnf_command'] = '/usr/bin/dnf'
config_opts['rpm_command'] = '/bin/rpm'
config_opts['rpmbuild_command'] = '/usr/bin/rpmbuild'
```

By default a Yum/DNF upgrade is performed before each build:

```shell
config_opts['update_before_build'] = True
```

#### resultdir repository generation

To have mock automatically run createrepo on the rpm packages in your resultdir, change the following configuration

```shell
config_opts['createrepo_on_rpms'] = False
config_opts['createrepo_command'] = '/usr/bin/createrepo_c -d -q -x *.src.rpm'
```

#### bootstrap

Sometimes the host's rpm/yum/dnf environment is not necessarily compatible with the rpm/yum/dnf environment in the mock chroot (of the system we want to build). Typically, when the host is a yum-based system and the target system is dnf-based, errors may occur while preparing the target mock buildroot, or even worse, unexpected and hard-to-notice installation operations may be produced.

Therefore, with the default `use_bootstrap=True`, we first install a minimal "bootstrap"

chroot, containing only the rpm/yum/dnf software stack, and then we use this "bootstrap" chroot

as the basis to initialize the target chroot.

```shell
config_opts['use_bootstrap'] = True
```

When 'use_bootstrap' is enabled, these commands can be used to install the package manager we want into the "bootstrap" chroot.

```shell
config_opts['yum_install_command'] = 'install yum yum-utils'
config_opts['dnf_install_command'] = 'install dnf dnf-plugins-core'
config_opts['system_yum_command'] = '/usr/bin/yum'
config_opts['system_dnf_command'] = '/usr/bin/dnf'
```

The bootstrap chroot is normally installed by the host using the package manager, but in some cases this cannot be done. (For example, installing a very new ZSTD-compressed dnf.rpm package through 'dnf_install_command' on an epel-7 host.) In such cases it may be necessary to deploy the "bootstrap" chroot beforehand from a container image (in which the package manager is already installed and mock does not need to handle it).

```shell
config_opts['use_bootstrap_image'] = False
config_opts['bootstrap_image'] = 'fedora:latest'
```

Any configuration defined in the 'bootstrap_*' format is copied into the bootstrap configuration, for example

```shell
config_opts['bootstrap_system_yum_command'] ='/usr/bin/yum-deprecated'
```

becomes the following in the bootstrap config

```shell
config_opts['system_yum_command'] = '/usr/bin/yum-deprecated'
```

Since extra packages and modules are normally not added to the bootstrap chroot, the following settings are overridden by their defaults in the bootstrap.

```shell
config_opts['bootstrap_chroot_additional_packages'] = []
config_opts['bootstrap_module_setup_commands'] = []
```

### Build dependency settings

Dynamic build dependencies (BuildRequires), supported by RPM 4.15 and above.

```shell
config_opts['dynamic_buildrequires'] = True
config_opts['dynamic_buildrequires_max_loops'] = 10
```

Allows the use of external build dependencies (external buildrequires), for example when a dependency has to be installed using PyPI or Rubygems

```shell
config_opts['external_buildrequires'] = False
```

### tar settings

The path of the tar program binary used by Mock is stored in config_opts['tar_binary']. Mock applies a different set of command-line options to the tar command; the available choices are "gnutar" or "bsdtar" (used by the root cache and SCM plugins, but also by the Mock core, together with the --use-bootstrap-image option, to unpack Podman container filesystems).

```shell
config_opts['tar_binary'] = "/bin/tar"
config_opts['tar'] = "gnutar"
```

### nosync settings

If you need to speed up package installation and builds, mock can use the nosync library to skip fsync and related calls coming from inside the mock program. This requires the nosync library to be installed, and for multilib targets the nosync library must be present for all architectures. If these conditions are not met, this cannot be enabled.

```shell
config_opts['nosync'] = False
```

If you do not want to install the nosync support library for all architectures but still want mock to use it, you can force-enable this option, but when running 32-bit programs there will be many (generally harmless) error messages from ld.so.

```shell
config_opts['nosync_force'] = False
```

### Result directory settings

The Resultdir option sets the directory where result files (RPMs and build logs) are written; it can contain any substitutable python string variable from the chroot configuration

```shell
config_opts["resultdir"] = "{{basedir}}/{{root}}/result"
```

## Plugin-related configuration

The following are the default configurations; adjust them according to the rules of the host (site). site-defaults.cfg is a good place to do so. Note: some cache options could in theory affect build reproducibility, so change them with caution.

```
config_opts['plugin_conf']['package_state_enable'] = True
config_opts['plugin_conf']['package_state_opts'] = {}
config_opts['plugin_conf']['package_state_opts']['available_pkgs'] = False
config_opts['plugin_conf']['package_state_opts']['installed_pkgs'] = True
config_opts['plugin_conf']['ccache_enable'] = False
config_opts['plugin_conf']['ccache_opts'] = {}
config_opts['plugin_conf']['ccache_opts']['max_cache_size'] = '4G'
config_opts['plugin_conf']['ccache_opts']['compress'] = None
config_opts['plugin_conf']['ccache_opts']['dir'] = "{{cache_topdir}}/{{root}}/ccache/u{{chrootuid}}/"
config_opts['plugin_conf']['yum_cache_enable'] = True
config_opts['plugin_conf']['yum_cache_opts'] = {}
config_opts['plugin_conf']['yum_cache_opts']['max_age_days'] = 30
config_opts['plugin_conf']['yum_cache_opts']['max_metadata_age_days'] = 30
config_opts['plugin_conf']['yum_cache_opts']['online'] = True
config_opts['plugin_conf']['root_cache_enable'] = True
config_opts['plugin_conf']['root_cache_opts'] = {}
config_opts['plugin_conf']['root_cache_opts']['age_check'] = True
config_opts['plugin_conf']['root_cache_opts']['max_age_days'] = 15
config_opts['plugin_conf']['root_cache_opts']['dir'] = "{{cache_topdir}}/{{root}}/root_cache/"
config_opts['plugin_conf']['root_cache_opts']['compress_program'] = "pigz"

decompress_program 仅用于bsdtar解压过程。对于bsdtar，缺省情况下（未设置decompress_program），解压过程由`compress_program`和`-d`配合完成，最终由 "unpigz" 或 "gunzip"实现。

config_opts['plugin_conf']['root_cache_opts']['decompress_program'] = "pigz"
config_opts['plugin_conf']['root_cache_opts']['extension'] = ".gz"
config_opts['plugin_conf']['root_cache_opts']['exclude_dirs'] = ["./proc", "./sys", "./dev", "./var/tmp/ccache", "./var/cache/yum", "./var/cache/dnf", "./var/log" ] 
config_opts['plugin_conf']['hw_info_enable'] = True
config_opts['plugin_conf']['hw_info_opts'] = {}
config_opts['plugin_conf']['procenv_enable'] = False
config_opts['plugin_conf']['procenv_opts'] = {}
config_opts['plugin_conf']['showrc'] = False
config_opts['plugin_conf']['showrc'] = {}
config_opts['plugin_conf']['tmpfs_enable'] = False
config_opts['plugin_conf']['tmpfs_opts'] = {}
config_opts['plugin_conf']['tmpfs_opts']['required_ram_mb'] = 1024
config_opts['plugin_conf']['tmpfs_opts']['max_fs_size'] = '768m'
config_opts['plugin_conf']['tmpfs_opts']['mode'] = '0755'
config_opts['plugin_conf']['tmpfs_opts']['keep_mounted'] = False
config_opts['plugin_conf']['chroot_scan_enable'] = False
config_opts['plugin_conf']['chroot_scan_opts'] = {'regexes': [ "^[^k]?core(\.\d+)?", "\.log$",], 'only_failed': True,}

'regexes'：为从buildroot 拷贝到resultdir的文件名正则表达式。
only_failed：若为True，则文件仅在编译失败时拷贝。
```

### bind mount plugin

The bind mount plugin is enabled by default, but no mount directories are configured by default

```shell
config_opts['plugin_conf']['bind_mount_enable'] = True
config_opts['plugin_conf']['bind_mount_opts']['dirs'].append(('/host/path', '/bind/mount/path/in/chroot/' ))
```

### lvm_root plugin

The lvm_root plugin is disabled by default, and its state is passed on to the remaining subpackage mock-lvm. If you want to use it, it is recommended to disable the root_cache plugin, otherwise caching will happen twice.

```shell
config_opts['plugin_conf']['lvm_root_enable'] = False
config_opts['plugin_conf']['lvm_root_opts'] = {}
```

Next, it must be provided with a volume group and sufficient space. It does not use any existing logical volume, so you can use the same volume group that you have enabled for other purposes. The VG name is needed here (not the device node path).

Specify the size occupied by mock's thin pool:

For ordinary packages with few dependencies, 2G should be enough.

For large packages such as libreoffice, at least 5GB must be set, otherwise the build will be blocked because space runs out.

```shell
config_opts['plugin_conf']['lvm_root_opts']['volume_group'] = 'my_vg'
config_opts['plugin_conf']['lvm_root_opts']['size'] = '2G'
```

An optional pool metadata size can be specified, in the same format as "size"; the default is determined by lvcreate's size.

```shell
config_opts['plugin_conf']['lvm_root_opts']['poolmetadatasize'] = None
```

When thin pool utilization exceeds 90%, mock stops working. Because once utilization reaches 100% it triggers all kinds of strange problems:

```shell
config_opts['plugin_conf']['lvm_root_opts']['check_size'] = True
```

Specifies whether the volume used by the buildroot should remain mounted after mock exits.

```shell
config_opts['plugin_conf']['lvm_root_opts']['umount_root'] = False
```

The filesystem format used by the lvm volume. The system formats the filesystem with the mkfs.$filesystem tool.

```shell
config_opts['plugin_conf']['lvm_root_opts']['filesystem'] = "ext4"
```

The complete command for creating the filesystem will receive the volume's path as an argument. If it is set here, it overrides the configuration above

```shell
config_opts['plugin_conf']['lvm_root_opts']['mkfs_command'] = None
```

Extra arguments passed to the mkfs command.

```shell
config_opts['plugin_conf']['lvm_root_opts']['mkfs_args'] = []
```

When mounting the volume, this argument is passed to mount's -o option; it can be set to a string or None.

```shell
config_opts['plugin_conf']['lvm_root_opts']['mount_opts'] = None
```

The wait time for LVM initialization to complete.

```shell
config_opts['plugin_conf']['lvm_root_opts']['sleep_time'] = 1
```

### overlayfs plugin

Since the overlayfs plugin implicitly initializes a snapshot after creation (postinit), like the lvm_root plugin, this makes the root cache pointless, so it is recommended to disable the root_cache plugin when the overlayfs plugin is enabled. (It is recommended to configure it together with config_opts['plugin_conf']['root_cache_enable'] = False)

```shell
config_opts['plugin_conf']['overlayfs_enable'] = False
config_opts['plugin_conf']['overlayfs_opts']['base_dir'] = /some/directory
config_opts['plugin_conf']['overlayfs_opts']['touch_rpmdb'] = False
```

### pm_request plugin

The pm_request plugin can install needed packages in the buildroot. This plugin is disabled by default because it affects build reproducibility. It can be enabled by setting the following option to True, but enabling it globally is not recommended. The best practice is to enable the plugin for a single build with '__--enable-plugin pm_request__'.

```shell
config_opts['plugin_conf']['pm_request_enable'] = False
config_opts['plugin_conf']['pm_request_opts'] = {}
```

### Log compression plugin

Enable this plugin if you need to compress mock logs.

```shell
config_opts['plugin_conf']['compress_logs_enable'] = False
```

The command used to compress logs - for example "/usr/bin/xz -9 --force"

```shell
config_opts['plugin_conf']['compress_logs_opts']['command'] = "gzip"
```

### Signing plugin

Configuration options of the signing plugin:

```shell
config_opts['plugin_conf']['sign_enable'] = False
config_opts['plugin_conf']['sign_opts'] = {}
config_opts['plugin_conf']['sign_opts']['cmd'] = 'rpmsign'
```

Options given to the signing command. %(rpms)s will be expanded to the rpm names in the result directory.

```shell
config_opts['plugin_conf']['sign_opts']['opts'] = '--addsign %(rpms)s -D "%%_gpg_name your_name" -D "%%_gpg_path /home/your_name/.gnupg"'
```

### rpkg plugin

Enables a preprocessing step, by using the rpkg tool, before the srpm build

```shell
config_opts['plugin_conf']['rpkg_preprocessor_enable'] = False
config_opts['plugin_conf']['rpkg_preprocessor_opts']['requires'] = ['preproc-rpmspec']
config_opts['plugin_conf']['rpkg_preprocessor_opts']['cmd'] = '/usr/bin/preproc-rpmspec %(source_spec)s --output %(target_spec)s'
```

## chroot environment variables

```shell
config_opts['environment']['TERM'] = 'vt100'
config_opts['environment']['SHELL'] = '/bin/bash'
config_opts['environment']['HOME'] = '/builddir'
config_opts['environment']['HOSTNAME'] = 'mock'
config_opts['environment']['PATH'] = '/usr/bin:/bin:/usr/sbin:/sbin'
config_opts['environment']['PROMPT_COMMAND'] = r'printf "\033]0;<mock-chroot>\007"'
config_opts['environment']['PS1'] = r'<mock-chroot> \s-\v\$ '
config_opts['environment']['LANG'] = 'C.UTF-8'
```

### PS1 example

```shell
config_opts['environment']['PS1'] = r'[\u@\h<mock-chroot>/\w]\[\033[01;31m\]${?/#0/}\[\033[00m\]\$'
```

You can generate your own configuration at this website: http://bashrcgenerator.com/

## Change with caution (changing is not recommended)

```shell
config_opts['chroothome'] = '/builddir'
config_opts['clean'] = True
```

Variable substitution cannot be used here, so rewriting this may not work properly:

```shell
config['rootdir'] = '/var/lib/mock/<CONFIG>/root/'
```

Valid for chroots of F25 and above. It overrides the 'use_container_host_hostname' configuration:

```shell
config_opts['macros']['%_buildhost'] = 'my.own.hostname'
```

## Configuration adjustments for SCM

```shell
config_opts['scm'] = True
config_opts['scm_opts']['method'] = 'git'
config_opts['scm_opts']['cvs_get'] = 'cvs -d /srv/cvs co SCM_BRN SCM_PKG'

若添加"--recurse-submodules"或"--recursive"选项，则git仓库中的子模块也将被检出。

config_opts['scm_opts']['git_get'] = 'git clone SCM_BRN git://localhost/SCM_PKG.git SCM_PKG'
config_opts['scm_opts']['svn_get'] = 'svn co file:///srv/svn/SCM_PKG/SCM_BRN SCM_PKG'
config_opts['scm_opts']['distgit_get'] = 'rpkg clone -a --branch SCM_BRN SCM_PKG SCM_PKG'
config_opts['scm_opts']['distgit_src_get'] = 'rpkg sources'
config_opts['scm_opts']['spec'] = 'SCM_PKG.spec'
config_opts['scm_opts']['ext_src_dir'] = '/dev/null'
config_opts['scm_opts']['write_tar'] = True
config_opts['scm_opts']['git_timestamps'] = True
config_opts['scm_opts']['exclude_vcs'] = True

以下选项也会被识别生效，但通常定义在命令行中：
--scm-option package=<pkg> --scm-option branch=<branch>

config_opts['scm_opts']['package'] = 'mypkg'
config_opts['scm_opts']['branch'] = 'main'
```

## Best practices for standalone chroot configuration files

### Required settings :

```shell
config_opts['root'] = 'name-of-yum-build-dir'
```

Mock uses the special (2) syscall to set the architecture information to 'target_arch'.

```shell
config_opts['target_arch'] = 'riscv64'
```

When the host system's architecture is not in the __'legal_host_arches' list__, mock will refuse to switch to 'target_arch' and will raise an error.

```shell
config_opts['legal_host_arches'] = ('i386', 'i586', 'i686', 'x86_64','riscv64')
```

#### About the contents of \$CHROOT/etc/yum/yum.conf or \$CHROOT/etc/dnf/dnf.conf

When DNF is used without a 'dnf.conf' configuration, the contents of 'yum.conf' will be filled into $CHROOT/etc/dnf/dnf.conf, and vice versa. But config_opts['yum.conf'] = '' and config_opts['dnf.conf'] = '' are mutually exclusive choices and should not be used at the same time.

**Special reminder: 'assumeyes=1' must be used in yum/dnf.conf, otherwise the Mock build will fail.**

The following configuration is for DNF, and can be used in dnf.conf for variable substitution of $key, whose value will be substituted in.

```shell
config_opts['dnf_vars'] = { 'key': 'value', 'key2': 'value2' }
```

To remove the warning that the system does not support the required package manager (for example, the host only has Yum support but the selected buildroot must be installed through Dnf), set the following configuration to False.

```shell
config_opts['dnf_warning'] = True
```

Warning! If it is False, RHEL{6,7} platforms will automatically use Yum.

#### riscv64-specific configuration

```shell
config_opts['qemu_user_static_mapping'] = {
    'riscv64': 'riscv64',
}
```

### Optional configuration

The following configuration is optional; the default configuration generally works:

```shell
config_opts['chroot_setup_cmd'] = 'install @buildsys-build'

@buildsys-build 是Fedora发行版定义在comps中的组。 
对于chroot_setup_cmd，实际需要以下软件包：
shadow-utils - mock 需要此包中的 /usr/sbin/useradd
rpm-build - mock 需要 /usr/bin/rpmbuild
glibc-minimal-langpack - 可选, 可避免安装庞大的glibc-all-langpacks。

config_opts['chroot_additional_packages'] = ''
config_opts['log_config_file'] = 'logging.ini'
config_opts['more_buildreqs']['srpm_name-version-release'] = 'dependency'
config_opts['more_buildreqs']['srpm_name-version-release'] = ['dependency1', 'dependency2']
config_opts['macros']['%Add_your_macro_name_here'] = "add macro value here"
config_opts['files']['path/name/no/leading/slash'] = "put file contents here."
config_opts['chrootuid'] = os.getuid()
config_opts['releasever'] = '20'
config_opts['dnf_disable_plugins'] = ['local', 'spacewalk', 'versionlock']
config_opts['yum_common_opts'] = []
config_opts['dnf_common_opts'] = ['--setopt=deltarpm=False', '--allowerasing']
config_opts['yum_builddep_opts'] = []
config_opts['dnf_builddep_opts'] = []
config_opts['microdnf_command'] = '/usr/bin/microdnf'

"dnf-install" 是特定关键字，告知 mock 使用DNF安装软件

config_opts['microdnf_install_command'] = 'dnf-install microdnf dnf dnf-plugins-core'
config_opts['microdnf_builddep_command'] = '/usr/bin/dnf'
config_opts['microdnf_builddep_opts'] = []
config_opts['microdnf_common_opts'] = []
config_opts['priorities.conf'] = 'put file contents here.'
config_opts['rhnplugin.conf'] = 'put file contents here.'

config_opts['subscription-manager.conf'] = 'put file contents here.'
企业版配置，必须先注册宿主机

这仅适用于DNF，且当仓库在dnf.conf中配置了modules=1。
在初始化chroot时，先于`chroot_setup_cmd`执行的模块命令列表。每个命令是一对配置，如 `(action, module_specs)`，`module_specs`是一个由逗号作为分隔符的模块说明列表命令是按配置的顺序执行，且每个`action`可以多次执行。示例: 
a.关闭任何潜在已使能的postgresql模块流;
b.使能 _特定的_ postgresql以及ruby模块流;
c.安装开发版本 nodejs 并and (d) 立即禁用它。

config_opts['module_setup_commands'] = [
    ('disable', 'postgresql'),
    ('enable',  'postgresql:12, ruby:2.6'),
('install', 'nodejs:13/development'),
('disable', 'nodejs'),
]

使用以下选项强制为某个特定构架编译 (必须安装 qemu-user-static)

config_opts['forcearch'] = None

模拟构架会导致编译缓慢，需要将其暴露给打包工程师，正常设为1，当使用forcearch时设为10。

config_opts['macros']['%_platform_multiplier'] = 1
```

### Username-related

```shell
config_opts['chrootgid'] = grp.getgrnam("mock")[2]
config_opts['chrootuser'] = 'mockbuild'
在chroot中执行命令时使用的用户名

config_opts['chrootgroup'] = 'mock'
在chroot中的组名

config_opts['useradd'] = '/usr/sbin/useradd -m -u {{chrootuid}} -g {{chrootgid}} -d {{chroothome}} -n {{chrootuser}}'   # Fedora/RedHat
```

If chrootgid needs to be changed, you must also correct, with the right group name, one line in the mock PAM configuration (in /etc/pam.d/mock, i.e. the "mock" in the line below) :

__auth sufficient pam_succeed_if.so user ingroup mock use_uid quiet__

### Security-related

```shell
config_opts['no_root_shells'] = False
```

### Proxy settings

The available settings are https_proxy, ftp_proxy and no_proxy, and a proxy can be specified, for example: 'http://localhost:3128'. But in the default configuration, existing environment variables are read and reused

```shell
config_opts['http_proxy']  = os.getenv("http_proxy")
config_opts['ftp_proxy']   = os.getenv("ftp_proxy")
config_opts['https_proxy'] = os.getenv("https_proxy")
config_opts['no_proxy']    = os.getenv("no_proxy")
```

### SSL certificates

Copies the host's SSL certificate bundle ('/etc/pki/tls/certs/ca-bundle.crt') to a specific location in the chroot. This is usually not necessary, because by default the entire /etc/pki/ca-trust/extracted directory is copied recursively, and that is how Fedora or EL systems work. But some target chroots may be configured differently, so copying the certificate bundle may help.

```shell
config_opts['ssl_ca_bundle_path'] = None
```

If you access a repository that requires client certificate authentication, the host's SSL certificates need to be copied to specific locations inside the chroot. Specify the __full path of the public certificate on the host__ and the __target directory in the chroot__, and do the same for the private key. If mock needs to run automatically unattended, the private key should not be password-protected. Example:

```shell
config_opts['ssl_extra_certs'] = None
config_opts['ssl_extra_certs'] = ['/etc/pki/tls/certs/client.crt', '/etc/pki/tls/certs/', '/etc/pki/tls/private/client_nopass.key.crt', '/etc/pki/tls/private/']
```

The user_agent string is used to identify HTTP requests sent to repositories.

```shell
config_opts['user_agent'] = "Mock ({{ root }}; {{ target_arch }})"
```

### Seccomp

Mock does not use Seccomp (a Linux kernel security facility), but systemd-nspawn and Podman (both of which Mock uses in several places in its implementation) do. The seccomp rule lists (syscall allow-lists) maintained by those tools usually differ between distributions, and even between versions. Since Mock can build across distributions, the rules of the "host" distribution often apply to the "target" distribution. To avoid complicating matters, and since by design Mock does not need complete isolation, seccomp is disabled by default for containerization tools.

```shell
config_opts["seccomp"] = False
```

### Other configuration

Create additional directories at chroot initialization. This is just a list of strings representing chroot paths, for example: [ '/run/lock', ]

```shell
config_opts['extra_chroot_dirs'] = []
```

Timeout in seconds for general mock operations; 0 means no timeout.

```shell
config_opts['opstimeout'] = 0
```
