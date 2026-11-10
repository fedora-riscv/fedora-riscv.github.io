---
title: "Using Koji"
slug: koji-usage
date: 2024-09-10T00:00:00+00:00
tags:
    - Koji
translation: machine
sourceHash: "45d6288faa0a56ee362d88195c0999a0"
---

<div align='center' ><font size='20'>Using the koji command line and the web interface</font></div>

![img](./2.1.png)

# 1. Using the Koji command-line tool (cli)

For most operations there is a single command-line entry point, "koji", which is provided by Koji's main package.

The koji command authenticates to the central server using Kerberos, so you need a valid Kerberos ticket to use many of its features. Nevertheless, many read-only commands also work without authentication.

## a. Exploring Koji

We have tried to make Koji itself carry as much usage information as possible. The Koji command-line tool can print a list of all commands, and every command supports the `--help` option. For example:

```shell
$ koji help
Available commands:
admin commands:
    add-channel               Add a channel
    add-external-repo         Create an external repo and/or add one to a tag
    add-group                 Add a group to a tag
    add-group-pkg             Add a package to a group's package listing
    add-group-req             Add a group to a group's required list
    ...

$ koji build --help
    Usage: koji build [options] <target> <srpm path or scm url>
The first option is the build target, not to be confused with the destination tag (where the build eventually lands) or build tag (where the buildroot contents are pulled from).
You can list all available build targets using the 'koji list-targets' command.
More detail can be found in the documentation.
https://docs.pagure.org/koji/HOWTO/\#package-organization
(Specify the --help global option for a list of other help options)
Options:
    -h, --help            show this help message and exit
    --skip-tag            Do not attempt to tag package
    --scratch             Perform a scratch build
    --rebuild-srpm        Force rebuilding SRPM for scratch build only
...
Try "koji --help" for help about global options
Try "koji help" to get all available commands
Try "koji <command> --help" for help about the options of a particular command
Try "koji help <category>" to get commands under a particular category
Available categories are: admin, all, bind, build, download, info, misc, monitor, search
```

Get help by consulting koji's help manual.

- koji help \# prints help for the commands available to anonymous users
- koji build help \# prints help for the build command
- koji help --admin \# prints help for the commands available to administrators (that is, all commands)

## b. Testing whether the koji client can connect to koji-hub

```shell
koji moshimoshi
```

If you do not get output similar to the following:

```shell
[anolis@openanolis-workstation root]$ koji moshimoshi
dobrý den, anolis!

You are using the hub at https://koji.tekkamanv.com/kojihub
Authenticated via client certificate /home/tekkamanv/.koji/tekkamanv.pem
```

please contact your koji administrator to have an account added and to obtain the certificate file and so on.

## c. Viewing the package list

As mentioned earlier, every tag has its own package list. The `list-pkgs` command shows the package list of a tag:

```shell
koji list-pkgs --tag f36

Package        Tag                            Extra Arches     Owner

----------------------- ----------------------- ---------------- --------

ElectricFence   f36                                             kojiadmin
```

The first column is the package name, __the second column tells you which tag this package is inherited from.__ The third column tells you who owns the package.

## d. Viewing recent builds

To see the latest build of a package in a tag, use the `latest-build` command:

```shell
$ koji latest-build  f36 zzuf
Build                           Tag                         Built by

----------------------------------------  --------------------  ---------

zzuf-0.15-16.fc36                f36                           kojiadmin
```

The output shows not only the latest built version of the package but also which tag the package is inherited from, and who built that version (note: for packages brought in with the import command, the words "built by" may be misleading). 

## e. koji package management

- Managing tags and build tags
  
  - A tag is a label used to manage imported PACKAGES; tags can be inherited
  
  - A build tag is the tag used when building software; a build tag generally inherits from a tag
    
    ```shell
    koji add-tag nk6.0-mips64el
    
    koji add-tag --parent nk6.0-mips64el --arches=mips64el nk6.0-mips64el-build
    ```
  
  - **Modifying tag properties**
    
    ```shell
    koji edit-tag  --arches='riscv64' f36dev_rv64_build
    #koji edit-tag [options] <name>
    #  --arches=ARCHES       Specify arches
    #  --perm=PERM           Specify permission requirement
    #  --no-perm             Remove permission requirement
    #  --lock                Lock the tag
    #  --unlock              Unlock the tag
    #  --rename=RENAME       Rename the tag
    #  --maven-support       Enable creation of Maven repos for this tag
    #  --no-maven-support    Disable creation of Maven repos for this tag
    # --include-all Include all packages in this tag when generating Maven repos
    #  --no-include-all      Do not include all packages in this tag when
    #                        generating Maven repos
    #  -x key=value, --extra=key=value
    #   Set tag extra option. JSON-encoded or simple value
    #  -r key, --remove-extra=key   Remove tag extra option
    #  -b key, --block-extra=key     Block inherited tag extra option
    ```
  
  - __Removing an unused tag__
    
    ```shell
    koji remove-tag nk6.0-mips64el
    ```

- Importing SRPMs and RPMs
  
  ```shell
  koji import [--link] <SRPM1> <SRPM2> ...
  
  koji import [--link] <RPM1> <RPM2> ...
  ```
  
  - __Principles for importing RPM packages:__
    
    - __Import the SRPM first, and then import the corresponding RPM packages;__
    
    - If you need to import an RPM that has no corresponding SRPM, use the following command to import the RPM directly:
      
      ```shell
      koji import --create-build <RPM1> <RPM2>
      ```
      
      If the packages to be imported are on the same partition as the /mnt/koji directory tree, it is recommended to use the --link option, which imports by creating hard links and can greatly speed things up.
  
  - __How to import an RPM whose Build ID already exists__
    
      If you try to import a package that koji has already built (whether the build failed or succeeded), the import will fail.
    
      The build must be handled at a low level with "__resetBuild + createEmptyBuild__" before the import can continue.
    
    ```shell
    koji call resetBuild <build>
    #  Reset a build so that it can be reimported
        WARNING: this function is highly destructive. use with care.
        nulls task_id
        sets state to CANCELED
        clears all referenced data in other tables, including buildroot and archive component tables
        after reset, only the build table entry is left
    koji call createEmptyBuild <name> <version> <release> <epoch> [owner=None]
    koji call deleteBuild <build>
    #  delete a build, if possible
        Attempts to delete a build. A build can only be deleted if it is
        unreferenced.
        If strict is true (default), an exception is raised if the build cannot
        be deleted.
    
        Note that a deleted build is not completely gone. It is marked deleted and some
        data remains in the database.  Mainly, the rpms are removed.
        Note in particular that deleting a build DOES NOT free any NVRs (or NVRAs) for
        reuse.
    koji call moveBuild <tag_src> <tag_des> <build> [force=False]
    #Move a build from tag1 to tag2
    ```
    
      [https://koji.fedoraproject.org/koji/api](https://koji.fedoraproject.org/koji/api)
  
  - __Tagging the imported packages__
    
    ```shell
    koji list-pkgs --quiet | xargs koji add-pkg --owner kojiadmin nk6.0-mips64el
    
    koji list-untagged | xargs -n 1 koji call tagBuildBypass nk6.0-mips64el
    ```

- Adding a group
  
  ```shell
  #Usage: koji add-group <tag> <group>
  koji add-group  nk6.0-mips64el-build build
  koji add-group  nk6.0-mips64el-build srpm-build
  ```

- __Modifying the properties of a build group__
  
  ```shell
  #Usage: koji add-group-pkg [options] <tag> <group> <pkg> [<pkg> ...]
  koji add-group-pkg nk6.0-mips64el-build build bash bzip2 coreutils cpio diffutils regulus-release findutils gawk gcc gcc-c++ grep gzip info make patch regulus-rpm-config rpm-build sed shadow-utils tar unzip util-linux-ng which
  koji add-group-pkg nk6.0-mips64el-build srpm-build bash curl git gnupg make rpm-build shadow-utils regulus-rpm-config regulus-release
  ```

- **Manually (re)generating a repository**
  
  ```shell
  #Usage: koji regen-repo [options] <tag>
  koji regen-repo nk6.0-mips64el-build
  ```

- **Adding a build target**
  
  ```shell
  koji add-target nk6.0-mips64el nk6.0-mips64el-build
  ```
  
    The format of this command is as follows:
  
  ```shell
  koji add-target target-name from-build-tag to-dist-tag
  ```
  
  - target-name: the name of the target
  - from-build-tag: use the collection of software repositories derived from the build-tag
  - to-dist-tag: finished builds are archived into the collection of software repositories of the destination tag; __if to-dist-tag has the same name as target-name, to-dist-tag can be omitted__

## f. Building a package (running a build)

Builds are started from the command-line tool. The syntax for building a package is as follows:

```shell
$ koji build <build target> <srpm path or scm url>
```

For example:

```shell
$ koji build f25 git://pkgs.fedoraproject.org/rpms/eclipse-jgit?\#00ca55985303b1ce19c632922ebcca283ab6e296
```

This `koji build` command creates a build task in Koji. By default, the command displays status updates until the build finishes; you can also return to the shell immediately with the `--nowait` option. Use the `--help` option to see the other options of the build command.

```shell
$ koji build --help
```

- Build options
  
  Here are more details about some of the build command's options:
  
  - `--skip-tag`
    
    Normally a package is tagged after the build completes. This option causes the tagging stage to be skipped. __The package (build) will be in the system but will not be tagged__ (it can later be tagged with the tag-build command).
  
  - `--scratch`
    
    This makes the build a "scratch" build. __Information about such a build is not imported into the database; it is simply built.__ The resulting rpms are placed in "\<topdir\>/scratch". "__Scratch" builds are not tracked and cannot be tagged,__ but they are convenient for testing. "Scratch" builds are generally deleted after a week.
  
  - `--nowait`
    
    As stated above, this makes the "koji" command return to the shell directly instead of waiting for the result of the build task.
  
  - `--arch-override`
    
    This option can be used to change the set of base architectures to build for. It is intended only for testing during the beta phase, but it may be kept for use with scratch builds in the future.

- Build failures
  
  If a package build fails, you will see a message like the following.
  
  ```shell
  420066 buildArch (kernel-2.6.18-1.2739.10.9.el5.jjf.215394.2.src.rpm,
            ia64): open (build-1.example.com) -> FAILED: BuildrootError:
            error building package (arch ia64), mock exited with status 10
  ```
  
  You can find the cause of the failure by looking at the log files. If there is a build.log, look at build.log first; otherwise look at init.log.
  
  ```shell
  $ ls -1 <topdir>/work/tasks/420066/*
            <topdir>/work/tasks/420066/build.log
            <topdir>/work/tasks/420066/init.log
            <topdir>/work/tasks/420066/mockconfig.log
            <topdir>/work/tasks/420066/root.log
  ```

- Creating tasks in bulk
  
  ```shell
  ls *.src.rpm | xargs -n 1 koji build --scratch nk6.0-mips64el
  ```
  
  After koji import, the package and the build do not yet have a tag,
  
  the build state is complete and cannot be built with koji build, so you need to run
  
  1. koji add-pkg --owner  kojiadmin dist-s8 go-ovirt-engine-sdk（package_name） 
  2. koji call deleteBuild （NVR），
  3. koji call resetBuild \<NVR\>  
  4. koji build dist-nk5u8 xxxx.src.rpm。
  
  Step 1: add the package to a tag, which is required before it can be built. Steps 2 and 3 change the state from complete to canceled.

# 2. Web interface

The main interface for viewing Koji data is a web application. Most of it is read-only, but if you are logged in (see below) and have sufficient permissions, some operations can be performed through the web interface. For example:

- Cancel a build task
- Resubmit a failed task

With administrator privileges, more operations are available, for example:

- Create/edit/delete a tag
- Create/edit/delete a build target
- Enable/disable a build host

The website uses Kerberos for authentication. To log in you need a Kerberos ticket, and your browser must be configured to send Kerberos information to the server.

For Firefox, go to the about:config page to set the Kerberos parameters. Type 'negotiate' in the search bar to filter the items that need changing from the list. Change the network.negotiate-auth.trusted-uris option to the domain you want to authenticate against, for example .example.com. If Kerberos ticket passing (delegation) is enabled, this configuration is not needed, and you can leave network.negotiate-auth.delegation-uris empty.

To obtain a Kerberos ticket, use the kinit command.
