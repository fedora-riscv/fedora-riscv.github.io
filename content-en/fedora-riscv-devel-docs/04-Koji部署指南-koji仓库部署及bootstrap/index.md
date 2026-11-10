---
title: "Setting up Koji repositories and bootstrapping"
slug: koji-repo-bootstrap
date: 2024-09-10T00:00:00+00:00
tags:
    - Koji
translation: machine
sourceHash: "35608dceb2e0ddec38ae88a78d7c877d"
---

<div align='center' ><font size='20'>Koji repository setup and bootstrap</font></div>

![img](./4.1.png)

# Initializing a new Koji build environment

***Prerequisites:**

- The Koji Hub is online, and a suitable authentication mechanism has been configured;
- The Koji repository management daemon (``kojira``) is also configured and able to run;
- Prerequisite for testing: at least one Koji builder (``kojid``) has been configured and is able to run.

Deploying a new Koji server and packages so that it can be used to build RPMs involves the following steps:

(Note: all koji commands below are run as the Koji system administrator)

## Preparation:

### Downloading and importing existing RPM packages

Download all the source rpm packages you need and the binary rpm packages for the architecture you are interested in.

To build rpms with koji/mock, the repository must provide the minimal build environment (rootfs) as well as the build dependencies of the specific package itself, so the basic requirement is a minimal set of about 150 SRPMs (and the corresponding binary rpm packages). This set differs only slightly between architectures. This initial package set has to be built through an architecture bootstrap, which is a complex process and will be described in a dedicated document later.

Here we assume the architecture has already completed the bootstrap process and that the packages to be built have no missing build dependencies, so it is enough to import the downloaded rpm packages.

#### Importing RPM packages (SRPMs and the corresponding RPMs).

```shell
find riscv64/ -iname '*.rpm' | xargs -n 1 koji import --link
find src/ -iname '*.rpm' | xargs -n 1 koji import --link
```

Note: if the rpm packages are on the same partition as /mnt/koji, you can create hard links of the files with ``koji import --link`` to avoid uploading them to the hub, which can speed up the import **very significantly**. **To use the ``--link`` option, you must be the root account.** Using the ``--link`` option is strongly recommended.

### Obtaining the complete package list of a release

With this package list we lay the groundwork for automated task submission later.

#### Via an official mirror repository

1. Download the \*-filelists.xml.gz file from the repository
   
   1. Mirror list: https://admin.fedoraproject.org/mirrormanager/
   2. For example, choose the 163 mirror, with the path http://mirrors.163.com/fedora/releases/36/Everything/source/tree/repodata/
   3. Download the *-filelists.xml.gz file in it. (Note: the package list can in fact also be filtered out of primary and other, but the filelists file is the smallest) 

2. Decompress the gz file, and filter out “\<package pkgid="\*" name="\*" arch="src">”

3. Process the text, keeping the value after `name=`; the list of these values is the list of package names in the repository.

#### Via the official fullfilelist file

1. Download the fullfilelist file from fedoraproject: https://dl.fedoraproject.org/pub/fedora/fullfilelist 

2. Obtain the package list file through text processing:
   
   ```shell
   grep src.rpm fullfilelist | \
   sed -e 's|^.*linux\/.*\/Packages\/.\/||g' \
   -e 's|-[^-]*-[^-]*.src.rpm$||g' | \
   sort | \
   uniq \
   > full_pkg_list.txt
   ```
   
   This operation gives you the latest complete package list.

#### Best method: via the official koji system

1. Install koji: **sudo yum install koji**, __the default configuration file points to the official koji system, and some distribution information can be obtained without logging in or a certificate__. Suppose we need the f36 src package list:

```shell
koji list-tagged --latest --rpms --arch src f36 > f36_src_list.txt
```

2. Obtain the package list file through text processing:

```shell
cat f36_src_list.txt | sed "s/-[^-]*-[^-]*.src$//g" > f36_pkg_list.txt
```

This operation dynamically gives you the latest package list.

### Obtaining software group information

#### Fedora functional group information

Official repository: https://pagure.io/fedora-comps

After git cloning the repository, build all the comps files with `make all`: comps-*.xml

#### Group information specific to the koji build system

Using the default koji configuration file (which points to the official koji system), you can obtain the group information of a specific build tag.

```shell
koji show-groups --comps f37-build > comps_f37_koji.xml
```

This file may differ between architectures, but not by much. It should be a good starting point for achieving a minimal build environment (buildroot).

- __Note:__ You can run the following command against the Fedora Koji instance to get the current Fedora *build* group information:

```shell
koji -s https://koji.fedoraproject.org/kojihub list-groups f37-build
```

## Creating and configuring a tag

A tag represents the collection of all packages contained in a release (or a variant/development version based on that release).

```shell
koji add-tag f36_rv64
```

Add the (package) package list (just the package names) to this tag.

```shell
cat f36_pkg_list.txt | xargs -n 64 koji add-pkg --owner f36_rv64
```

If you only want to include the packages you have already imported, do the following (not recommended):

```shell
koji list-pkgs --quiet | xargs -n 64 koji add-pkg --owner <kojiuser> f36_rv64
```

## Creating and configuring a build tag

A build tag represents a build environment based on its parent tag, so compared with the parent tag, besides taking the tag created earlier as its parent to inherit all of its package list information, it also carries the architecture information, group information and so on needed for building.

```shell
koji add-tag --parent f36_rv64 --arches "riscv64" f36_rv64_build
koji add-tag-inheritance --priority 1 f36_rv64_build f35_rv64_build
```

### Importing group information

After you have obtained the XML files of a tag's Fedora group information (two files: one is the functional groups, the other is the *-build group that koji needs), import them in bulk into your build tag:

```shell
koji import-comps comps_f36.xml f36_rv64_build
koji import-comps comps_f36_koji.xml f36_rv64_build
```

To add group information manually, see the [Appendix](https://lwebapp.com/zh/docx-to-markdown#_手动添加组信息流程).

## Creating a build target

A build target describes a build process, and it contains the two tags you have already created: the tag and the build tag.

```shell
koji add-target f36_rv64_build_target f36_rv64_build f36_rv64
#koji add-target <target name> <build tag> <des tag>
```

## Tagging the imported packages (builds)

### Method 1: list-untagged

Use ``koji list-untagged`` to get the list of all builds that have just been imported and not yet tagged:

```shell
koji list-untagged | xargs -n 1 koji call tagBuildBypass f36_rv64
```

### Method 2: find

Get the build list directly from the list of imported srpm files:

```shell
find src/  -iname '*.rpm'  | \
sed -e 's|^src\/Packages\/.\/||g' \
-e 's|\.src\.rpm$||g'  > \
Builds_list.txt
cat Builds_list.txt | xargs -n 1 koji call tagBuildBypass f36_rv64
```

The *tagBuildBypass* method is called (instead of using ``koji tag-build``) so that the Builder does not have to handle *tagBuild* repeatedly and the tag is simply applied directly. This saves a lot of time, especially when tagging a large number of packages.

## (Re)generating repository data (repodata)

```shell
koji regen-repo f36_rv64_build
```

Once the repository has been created, normal builds should be possible.

# Bootstrapping a new Koji build environment that uses an external repository

Configuring an external repository on the Koji server and making it usable for building involves the following steps.

The prerequisites are the same as in the previous section.

(Note: all koji commands below are run as the Koji system administrator)

## **Preparation:**

**Copy**

## **optional: Creating a new tag and its build tag**

```shell
koji add-tag f36_rv64_dev
```

And set the architecture information you need, taking the tag created earlier as the parent tag.

```shell
koji add-tag --parent f36_rv64_dev --arches "riscv64" f36_rv64_dev_build
```

### [Importing group information](https://lwebapp.com/zh/docx-to-markdown#_导入组信息)

## Adding an external repository to the build tag

__Koji replaces \$arch with the arches of the build tag. But __``$`` needs an escape character__ to prevent the shell from interpreting it as a variable before it is passed to Koji. See the external repository URL examples below.

```shell
$ koji add-external-repo -t f36_rv64_dev_build f36_rv64_dev_build-external-repo http://koji.tekkmanv.com/path/to/repo/for/foo/\$arch/
#koji add-external-repo [options] <name> [<url>]
#-t TAG, --tag=TAG
#-p PRIORITY, --priority=PRIORITY
#-m MODE, --mode=MODE  Set merge mode(koji/bare/simple)
```

- Note: \$arch is used here, not \$basearch.

### Note: repository priority

__If you need to add several external repositories, koji assigns each repository a priority in first-in-first-out (FIFO) order. This can make updated packages invisible because the repository holding the older package has a higher priority (the smaller the number, the higher the priority).__ Use the ``-p`` option to specify a particular repository priority.

### Note: external repository merge modes

Koji handles external repositories differently depending on the merge (``merge``) mode. The merge mode can be set with ``-m`` to one of the following:

##### ``koji``

Basic mode - koji considers the repository to be complete and free of mixed content, that is, for any package in the repository, its rpm packages all originate from the same SRPM. The operation that generates its repository, ``mergerepos_c --koji``, is carried out through the ``dist-repo`` command. (All other repositories coming from koji have this property.)

##### ``bare``

It is implemented with ``mergerepos_c --pkgorigins --all``. This merges in all packages with the same package name and architecture, **as long as the version or release differs. Modular repos rely on this feature. This requires ``createrepo_c`` version 0.14 or later to be installed on the builder, built with libmodule support enabled. Even with this option, when packages with the same NEVRA (name-epoch-version-release-arch) are encountered, only the first rpm encountered is accepted.**

##### ``simple``

It is implemented with ``mergerepos_c --mode simple`` - this is the least restrictive repository type. It even accepts packages with the same NEVRA (name-epoch-version-release-arch). Simple mode was introduced in the ``createrepo_c`` suite in version 0.13. The reasons to use this mode rather than ``bare`` mode are:

- you are using an older version of the ``createrepo_c`` software,
- you really do want packages with the same NEVRA to coexist in the repository.

### Modifying the external repository configuration

```shell
koji edit-external-repo --url='https://koji.tekkamanv.com/repos/splited/f36/$arch/' -m koji -t  f36_rv64_dev_build f36_rv64_dev_build-external-repo
#koji edit-external-repo [options] <name>
# --url=URL             Change the url
# --name=NAME           Change the name
#-t TAG, --tag=TAG
#-p PRIORITY, --priority=PRIORITY
#-m MODE, --mode=MODE  Set merge mode(koji/bare/simple)
#-a ARCH1,ARCH2, ..., 
```

### External repository URL examples

The Fedora minimal buildroots require downloading about 100Mb of data, and then the build dependencies must be downloaded as well. These are downloaded on every build; you can save a lot of network bandwidth by using a local mirror or a caching proxy.

**Note: \$arch is used here, not \$basearch**

Fedora 36

```
https://mirrors.kernel.org/fedora/releases/36/Everything/\$arch/os/
https://mirrors.kernel.org/fedora/updates/36/Everything/\$arch/
```

CentOS 7 and EPEL

```
https://mirrors.edge.kernel.org/centos/7/os/\$arch/
https://mirrors.edge.kernel.org/centos/7/updates/\$arch/
https://mirrors.kernel.org/fedora-epel/7/\$arch/
```

## **Creating a build target**

Make it use the build tag you have already created.

```shell
koji add-target f36_rv64_dev_build_target   f36_rv64_dev_build f36_rv64_dev
```

At this point you can verify with the "taginfo" command that its external repository has been set up, that is, that it is listed under "External repos". The following is an example with an F33 external repository added:

```shell
koji taginfo dist-foo-build
```

### Tag and build target examples

It is best to configure external repositories in a child tag, to avoid their being inherited by other tags.

Assume a minimal configuration: we only want to build from the packages in the external repositories, so we may configure a simple tag hierarchy:

- the [dist-fX-updates] tag and its target inherit the [dist-fX-build] tag, with the external repositories attached
- the [dist-fX-build] tag in turn inherits from other tags

In this case the [dist-fY-build] or [dist-fY-updates] tags do not automatically inherit the external repositories of the [dist-fX-*] tags.

#### Tags

```shell
 dist-f36-updates  - 此为带有f36 release及f36 updates外部仓库的标签
     `- dist-f36-build - 此为带有从dist-f35-build继承而来的'build'和
          |                'srpm-build'分组信息的 f36 编译标签，故其buildroot
          |                得以部署，但无需为每个单独的release来维护分组信息。
         `- dist-f35-build          - etc.
             `- dist-f34-build      - etc.
```

#### Build targets

Every [dist-fX-build] tag has a [dist-fX-updates] child tag (which inherits [dist-fX-build]), and every [dist-fX-updates] tag in turn has a corresponding [dist-fX-updates-candidate] build target.

## **(Re)generating repository data (repodata)**

```shell
koji regen-repo f36_rv64_dev_build
```

Once the repository has been created, normal builds should be possible.

### About repository updates

By default, koji does not monitor external repositories for changes. Administrators can enable this feature by setting

``check_external_repos = true`` in `kojira.conf` (see :doc:`utils` for details). If this setting is not enabled, a new repository is regenerated when you add a build to a tag related to a buildroot, or when you regenerate the repository manually. You should make sure to regenerate the repodata manually often to pick up updates in the external repositories.

# Reference layout of a repository built jointly with Mock (user mode) + Koji

![img](./4.2.png)

# **Appendix**

## Procedure for adding group information manually

In practice, the *build* groups required by a build tag are build, srpm-build and appliance-build:

```shell
koji add-group f36_rv64_build build
koji add-group f36_rv64_build srpm-build
koji add-group f36_rv64_build appliance-build
#koji add-group <build tag> <group name>
```

Add packages to the corresponding *-build groups:

```shell
koji add-group-pkg f36_rv64_build build pkg1
```

| Group name | package                                                                                                                                                                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| build      | bash<br />bzip2<br />coreutils<br />cpio<br />diffutils<br />findutils<br />gawk<br />gcc<br />gcc-c++<br />grep<br />gzip<br />info<br />make<br />patch<br />regulus-release<br />regulus-rpm-config<br />rpm-build<br />sedshadow-utils<br />tar<br />unziputil-linux-ng<br />which |
| srpm-build | bash<br />curl<br />git<br />gnupg<br />make<br />rpm-build<br />shadow-utils<br />regulus-rpm-config<br />regulus-release                                                                                                                                                             |

## Minimal environment required by koji build

The minimal build environment must be built in advance and contains the following source packages:

| bash               |
| ------------------ |
| gawk               |
| rpm                |
| bzip2              |
| gcc                |
| sed                |
| coreutils          |
| git                |
| regulus-release    |
| tar                |
| cpio               |
| gnupg2             |
| texinfo            |
| curl               |
| grep               |
| unzip              |
| diffutils          |
| gzip               |
| regulus-rpm-config |
| util-linux-ng      |
| findutils          |
| make               |
| patch              |
| which              |
