---
title: "Koji basics"
slug: koji-basics
date: 2024-09-10T00:00:00+00:00
tags:
    - Koji
translation: machine
sourceHash: "097c55e09c507bc2cc4cafac1eb45fec"
---

<div align='center' ><font size='20'>Koji Overview</font></div>

![img](./1.1.png)

[TOC]

# 1. Introduction

Koji is Fedora's package build management tool, a system for building and tracking RPMs.

Home page: [https://pagure.io/koji](https://pagure.io/koji)

Main documentation: [https://docs.pagure.org/koji/](https://docs.pagure.org/koji/)

It is designed with the following features in mind:

- Security
  
  - Every build uses a fresh buildroot (the root filesystem used for building)
  
  - NFS is read-only in most cases

- Leveraging other software
  
  - Uses the open-source Dnf/Yum and Mock software as components
  
  - Uses XML-RPC APIs for better integration with other tools

- Flexibility
  
  - Rich data model
  
  - Active code base

- Usability
  
  - Web interface with Kerberos authentication
  
  - Portable thin client
  
  - Users can create local buildroots

- Reproducibility
  
  - Buildroot contents are tracked in the database
  
  - Data is version-controlled

This document describes the basic tasks that developers need to perform with Koji.

## a. Terminology

There are three important concepts in the Koji system:

### Package

Represented by the __name__ of a Source RPM (SRPM). It denotes a software package in the general sense, without specifying a particular version or the set of RPMs it builds. For example: kernel, glibc, gcc, and so on.

### Build

A specific version of a package. It represents all the RPMs produced by one build of the package, including all architecture-specific packages and all other packages built. For example: kernel-2.6.9-34.EL, glibc-2.3.4-2.19.

### RPM

A specific rpm package: a package of a particular architecture and name produced by one build. For example: kernel-2.6.9-34.EL.x86\_64, kernel-devel-2.6.9-34.EL.s390, glibc-2.3.4-2.19.i686, glibc-common-2.3.4-2.19.ia64.

### N-V-R

That is, Name-Version-Release. For example, in kernel-5.18.4-201.0.riscv64.fc36.riscv64.rpm, Name="kernel", Version="5.18.4-201.0.riscv64.", Release="fc36".

The NVR comes from the corresponding fields in the SPEC file, not from the rpm file name. For example, gcc-12.0.1-0.8.1.fc36.riscv64.rpm and gcc-c\+\+-12.0.1-0.8.1.fc36.riscv64.rpm are actually built from a single srpm, gcc-12.0.1-0.8.1.fc36.src.rpm, so the package name of both is gcc, i.e. they belong to the same package.

* **NEVRA(name-epoch-version-release-arch)**

### tag

Koji uses tags to refer to collections of packages or builds. That is, multiple packages or builds can be given the same tag. A package must be tagged before the builds belonging to that package can be tagged.

- **build tag**

A tag that simply serves a different purpose. __A tag is just a collection of packages__; __a build tag is generally inherited from some tag and additionally contains arch and build-group information__, and can be used to create build tasks for different architectures. For example, you can create one build tag each for i386 and x86\_64 and reference only one of them each time, to create builds of different architectures for its parent tag.

### build group

Specifies all the rpm packages that need to be installed in the mock chroot; mock then also installs all the dependencies of the package to be built, and together they make up the base build system.

### build target

Indicates from which build tag a build takes its packages and build architectures, and which tag the build is tagged into after it finishes (by default the tag with the same name as the target-name, __but it can also be specified, so a build target and a tag are essentially different things.__).

### channel

A channel controls the types of tasks a builder can handle. By default, all builders join the default channel. However, at least some builders need to join the createrepo channel, so that they can perform the repository-creation tasks initiated by kojira.

# 2. Architecture overview

![img](./1.2.png)

Example architecture diagram

## a. Components of Koji:

### koji-hub

It is the core of all Koji operations, an XML-RPC service running under Apache's mod\_wsgi module. koji-hub only accepts XML-RPC requests __passively__, relying on the build daemon (kojid) and other components to initiate interaction. koji-hub is the only component that can access the database directly, and it is one of the two components with write access to the filesystem (the other is koji).

### kojid

The build daemon, which runs on every machine that executes build tasks. Its main job is to poll for build requests and handle them accordingly. Besides building, Koji also supports other tasks, such as creating installation images (Image). kojid can perform such tasks as well.

kojid uses mock to build. It creates a clean build environment (buildroot) for each build task. kojid is implemented in python and communicates with koji-hub through XML-RPC.

### koji-web

A set of scripts running under mod\_wsgi that provide Koji with a Web interface using the Cheetah template engine. koji-web can not only display a lot of information but also offer certain operations, such as cancelling a build task.

### koji

A command-line program implemented in python, providing many ways (hooks) of operating Koji. It lets users query a lot of information and also perform many operations, such as initiating a build task.

### kojira

A daemon that ensures the repository data used by build environments (build roots) is continuously kept up to date.

# 3. How packages are organized

## a. Tags and Targets

### Koji uses 'tags' to organize packages.

In Koji, a tag is similar to an instance of a beehive collection, but differs in the following respects:

- Tags are stored in the database rather than on the disk filesystem
- Tags support multiple inheritance
- Each tag has its own list of valid packages (the package list can be inherited by other tags)
- Different owners can be set for a package per tag (the ownership relation can also be inherited by other tags)
- The tag inheritance process is configurable
- __When you build a package, you should specify a "target", not a tag__

### A build target indicates the environment (Buildroot) in which the package build should take place (that is, the build tag), and the (Destination) tag with which the resulting packages should be tagged.

When the name of a tag changes with the version of the released system, the name of the target can stay the same. You can get the full list of build targets with the following command:

```shell
koji list-targets
```

You can view the information of a single target with the --name option:

```shell
koji list-targets --name  f36
    Name                           Buildroot                      Destination
    ---------------------------------------------------------------------------
    f36                                f36-build                      f36
```

This tells you that when building packages with the  __f36 target, the build environment consists of the packages in the f36-build tag, and the resulting packages will be placed into the f36 tag__.

You can view the list of tags in the system with the following command:

```shell
koji list-tags
```

### Tag inheritance

Almost everything in koji is handled through tags and their inheritance relationships. So what are the benefits, and how is it configured?

Each tag handles its own configuration, and the system administrator can maintain just that configuration. The real power of the tag structure is hidden in the inheritance relationships. You can create a tag by inheriting parent data into a new version or another layer of product.

Each tag contains the following data:

- __Tag data__
  
  - Architectures
    
    This refers to a set of architectures that will be used when the given tag is used as a build environment (buildroot) (that is, when defining a target \[target\]).
  
  - comps groups
    
    Similar to architectures, this data provides package-installation group information when the tag is used as a build environment (buildroot). Generally speaking, the `srpm-build` and `build` groups are needed in almost all cases. For operations other than building rpm packages, some extra groups may also be needed, such as `maven-build` or `livemedia-build`. Groups can be created and modified with the `*-group-*` koji commands.
  
  - maven options 
    
    If the maven build tool is enabled in the koji environment (this needs to be configured in koji-hub), `maven_support` and `include_all` are the relevant options. The first indicates that a maven repository should be generated, while the second restricts whether certain packages that have been tagged should all be present in this repository.

- __Package list__
  
   __Each tag carries a list of packages that can be tagged__, along with the owner of each package/tag combination.
  
   Note that __the owner is mainly used to indicate the default notification recipient__ and is not an operation permission; it can be changed at any time. The owner relation is also not limited to anyone who can "remove/apply" tags to builds of a 'tag/package'. In addition, this is driven through the hub protocol. In short, the package list is simply the packages that can be tagged (they may even have no corresponding builds).

- __List of tagged builds__
  
   This is the last member of a tag. Obviously, the packages in the build list all come from the previous concept (the package list). There are no builds based on packages outside the package list.

__These three sets of data can be inherited and propagated through the inheritance chain.__

- __Inheritance options__
  
  The whole inheritance relationship can be modified through the `add-tag-inheritance` and `edit-tag-inheritance`
  
  commands on the command line. They have the same options; the descriptions and examples are as follows:
  
  The simple `add-tag-inheritance` command takes two tags that already exist, and this command links them together in an inheritance chain.
  
  ```shell
  $ koji add-tag parent
  
  $ koji add-tag child
  
  $ koji add-tag-inheritance child parent
  
  $ koji list-tag-inheritance child
  
  child (168)
  
  ....  └─parent (167)
  ```
  
  This example shows a basic inheritance chain: the `child` tag inherits data from the `parent` tag. The __number after a tag is the tag's ID__ (usually not something to worry about, but handy in koji scripts). The four dots at the start of the line are placeholders for the different inheritance flags. They are M, F, I, N, standing for `maxdepth`, `pkg_filter`, `intransitive` and `noconfig` respectively. All of them can be specified on the command line.
  
  - priority
    
    When you add a new inheritance relationship to a tag that already has a parent tag, you may want to indicate where the new parent tag sits in the inheritance chain.
    
    Let us continue from the previous example:
    
    ```shell
    $ koji add-tag less-significant-parent
    
    $ koji add-tag-inheritance child less-significant-parent --priority 100
    
    $ koji list-tag-inheritance child
    
          child (168)
    
     ....  ├─parent (167)
    
     ....  └─less-significant-parent (169)
    ```
    
    Here, the original `parent` has the default priority 0, while the new parent tag's priority is set to 100.
    
    __The smaller the number, the higher the priority__. And you can always change the priority within the inheritance relationship through `edit-tag-inheritance`.
    
    > Note: A good rule of thumb is to set the priority at the same time as you create the inheritance relationship, and to use steps of 10 or 100. When you later need to insert other inheritance relationships in between, you do not have to change the existing priorities (you can use a setting such as 15, as in the old days of Basic).
  
  - maxdepth
    
    For longer inheritance chains, you may not want to process the whole chain. Now let us drop our earlier example and look at a more realistic situation.
    
    ```shell
    $ koji list-tag-inheritance linux3-build
    
    linux3-build (4380)
    
    ....  └─linux3-override (4379)
    
    ....     └─linux3-updates (4373)
    
    ....        └─linux2 (4368)
    
    ....           └─linux1 (4350)
    
    ....              └─linux0 (4250)
    
    $ koji add-tag linux4-build
    
    $ koji add-tag-inheritance linux4-build linux3-build --maxdepth 0
    
    $ koji list-tag-inheritance linux4-build
    
    linux4-build (4444)
    
    M...  └─linux3-build (4380)
    ```
    
    This situation does not occur in Fedora's koji system, because Fedora does not reuse any packages from previous versions but does a large-scale rebuild. But such situations do exist. In this case, if we only need the packages from `linux3-build`, and not any packages it inherits. __then `maxdepth` comes in handy; it can cut off the rest of the inheritance chain.__
  
  - intransitive
    
    Intransitive inheritance links, as the name suggests. If they are used somewhere in an inheritance chain, the rest of the chain is ignored. This can be used to avoid some inheritance information being propagated by mistake. Combined with `maxdepth`, it allows inheritance to stop before `maxdepth` is reached.
  
  - noconfig
    
    Compared with the 'normal' way of inheriting everything (such as the tag's configuration, package list and tagged builds), if this option is used, only the package list and builds are inherited, and everything else is ignored (architectures, locks, permissions, maven support).
  
  - __pkg-filter__
    
    __A package filter is defined as a regular expression, used to filter the packages propagated through this inheritance link.__
