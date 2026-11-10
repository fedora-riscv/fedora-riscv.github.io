---
title: "Fedora Module Build Service (MBS)"
slug: fedora-module-build-service
date: 2024-09-10T00:00:00+00:00
translation: machine
sourceHash: "977222e715743bac16352b0bc24d1248"
---

## Fedora Modularity

In short, Modularity extends an RPM repository with the following capabilities: 
* A module stream adds additional packages with the same names but built from different sources and with different build configurations. 
* Module streams can have different life cycles. For example, a package in the distribution can have a life cycle different from that of the distribution. 
* Module streams can have different installation profiles for their components; that is, you can define one or more module stream profiles that contain groups of RPMs that should be installed together. 

## Fedora Module Build Service

The Fedora Module Build Service (MBS) coordinates the module build process and is responsible for the following tasks:
• Providing an interface for client tools to submit modules and query build status
• Validating that the input data (such as modulemd and RPM SPEC files) is usable and correct
• Preparing the build environment inside a supported build system (such as Koji)
• Scheduling and building the module components, and tracking build status
• Sending bus messages (such as fedmsg or Apache MQ) when the status changes, so that other infrastructure services can pick up the task

Rocky Linux provides a not entirely complete MBS installation guide: https://wiki.rockylinux.org/archive/legacy/mbs_installation/

## Building modules locally
For a tutorial on building online (which seems to require a Fedora ID with the proper permissions), see: https://docs.fedoraproject.org/en-US/modularity/building-modules/fedora

## Prerequisites 

Before you start building modules locally, the following dependencies must be installed: 
$ sudo dnf install module-build-service fedpkg rpkgIf you do not intend to run the build commands as root, you must add your user to the mock group: 
$ sudo usermod -a -G mock USERNAME
$ newgrpBuilding your module from distgit 
Local builds start by using fedpkg from your dist-git repository. 
For example, to submit a build of the testmodule:master module, run: 

$ fedpkg clone modules/testmodule
$ cd testmodule
$ git checkout master
$ fedpkg module-build-local

After the build completes, you will find the build results in ~/modulebuild/builds/MODULE/results/ .

In addition, local builds do not support stream expansion. If your module depends on multiple streams of another module, for example platform, you need to specify the stream to build against. For example: fedpkg module-build-local -s platform:f28.

##  Deploying MBS 

### Installing packages

This mainly means installing Apache and the dependencies of MBS.

```
dnf install fedmsg python3-gssapi git httpd mod_ssl python3-mod_wsgi python3-solv python3-pungi python3-psycopg2 mod_auth_gssapi module-build-service -y
```

### Configuring and starting Fedmsg

Fedmsg is Fedora's own messaging service, and MBS uses Fedmsg to coordinate with the various parts of Fedora's infrastructure. But we do not need Fedmsg for coordination, so the current configuration only runs Fedmsg without sending data to Fedora. The default configuration therefore needs a few changes, mainly commenting out Fedora's servers and signature validation:

```python
/etc/fedmsg.d/endpoints.py
------
    endpoints={
        # These are here so your local box can listen to the upstream
        # infrastructure's bus.  Cool, right?  :)
        "fedora-infrastructure": [
            # "tcp://hub.fedoraproject.org:9940", <- 注释此行
            # "tcp://stg.fedoraproject.org:9940",
        ],
        # "debian-infrastructure": [
        #    "tcp://fedmsg.olasd.eu:9940",
        # ],

```

```python
/etc/fedmsg.d/module_build_service.py
------
config = {
    # Just for dev.
    "validate_signatures": False,  # <- 设置为 False
	  'sign_messages': False,   # <- 设置为 False
    # Talk to the relay, so things also make it to composer.stg in our dev env
    "active": True,
    # Since we're in active mode, we don't need to declare any of our own
    # passive endpoints.  This placeholder value needs to be here for the tests
    # to pass in Jenkins, though.  \o/
    "endpoints": {
        "fedora-infrastructure": [
            # Just listen to staging for now, not to production (spam!)
            # "tcp://hub.fedoraproject.org:9940", # <- 注释掉
            # "tcp://stg.fedoraproject.org:9940"
        ]
    },
    # Start of code signing configuration
    # 'sign_messages': True,  # <- 注释掉
    # 'validate_signatures': True,  # <- 注释掉
    # 'crypto_backend': 'x509',
    .....
}

```

```python
/etc/fedmsg.d/ssl.py
------
config = dict(
    sign_messages=False,   # <- 设置为 False
    validate_signatures=False,   # <- 设置为 False
    ...)
```

The Topic here also has to be changed to your own:

```python
/etc/fedmsg.d/base.py
------
config = dict(
    # Prefix for the topic of each message sent.
    topic_prefix="org.fedora-plct", # <- 改为自己的名称

    # Set this to dev if you're hacking on fedmsg or an app.
    # Set to stg or prod if running in the Fedora Infrastructure
    environment="dev",
    ......)
```

Start the two services with Systemd:

```bash
systemctl enable fedmsg-hub --now
systemctl enable fedmsg-relay --now
```

### Apache configuration for mbs-frontend

The MBS frontend is a wsgi application, which cannot be run directly and should be used together with a server such as Apache Httpd. Create the following configuration file:

```txt
/etc/httpd/conf.d/mbs.conf
------
<IfModule mod_ssl.c>
<VirtualHost *:443>
  ServerName mbs.gnulab.org
  WSGIDaemonProcess mbs user=mbs group=mbs threads=5
    WSGIScriptAlias / /etc/module-build-service/mbs.wsgi
  WSGIPassAuthorization on
    <Directory /etc/module-build-service>
        WSGIProcessGroup mbs
        WSGIApplicationGroup %{GLOBAL}
        Require all granted
    </Directory>
#    <Location />  # <- 测试时不使用 Krb 注释掉
#        AuthType GSSAPI
#        AuthName "GSSAPI Single Sign On Login"
#        GssapiCredStore keytab:/etc/koji.keytab
#        Require valid-user
#    </Location>

# 测试时不使用 SSL 注释掉
# SSLCertificateFile /etc/letsencrypt/live/mbs.gnulab.org/fullchain.pem 
# SSLCertificateKeyFile /etc/letsencrypt/live/mbs.gnulab.org/privkey.pem
# Include /etc/letsencrypt/options-ssl-apache.conf
</VirtualHost>
</IfModule>
```

A WGSI file must also be created:

```python
/etc/module-build-service/mbs.wsgi
------
import logging
logging.basicConfig(level=logging.DEBUG)
from module_build_service import app as application
```

### MBS configuration

Next, we create a user for MBS and configure file permissions:

```
useradd mbs
passwd mbs
chown -R mbs:mbs /etc/module-build-service/
touch /tmp/module_build_service.log
chown mbs:fedmsg /tmp/module_build_service.log
chmod 664 /tmp/module_build_service.log
```

Then add the MBS user in the Koji system:

```
koji add-user mbs
koji call addBType module
koji grant-cg-access mbs module-build-service --new
```

MBS has its own Koji configuration; write it according to your actual setup:

```ini
/etc/module-build-service/koji.conf
------
[koji]

;url of XMLRPC server
server = https://openkoji.iscas.ac.cn/kojihub
;url of web interface
weburl = https://openkoji.iscas.ac.cn/koji
;url of package download site
topurl = https://openkoji.iscas.ac.cn/kojifiles
;path to the koji top directory
topdir = /mnt/koji

; configuration for SSL athentication
authtype = ssl

;client certificate
cert = /home/mbs/.koji/mbs.pem

;certificate of the CA that issued the HTTP server certificate
serverca = /home/mbs/.koji/koji_ca_cert.crt
```

Finally, the configuration of MBS itself, to be modified as needed:

```python
/etc/module-build-service/config.py
------
# -*- coding: utf-8 -*-
# SPDX-License-Identifier: MIT
from os import environ, path

# FIXME: workaround for this moment till confdir, dbdir (installdir etc.) are
# declared properly somewhere/somehow
confdir = path.abspath(path.dirname(__file__))
# use parent dir as dbdir else fallback to current dir
dbdir = path.abspath(path.join(confdir, "..")) if confdir.endswith("conf") else confdir


class ProdConfiguration(object):
    DEBUG = True
    # Make this random (used to generate session keys)
    SECRET_KEY = "74d9e9f9cd40e66fc6c4c2e9987dce48df3ce98542529126"
    SQLALCHEMY_DATABASE_URI = "sqlite:///{0}".format(path.join(dbdir, "module_build_service.db")) # 测试期间就用 SQLite 了
    #SQLALCHEMY_DATABASE_URI = 'postgresql://mbs:mysupersecretepasswordmbs@koji.gnulab.org/mbs'
    SQLALCHEMY_TRACK_MODIFICATIONS = True
    # Where we should run when running "manage.py run" directly.
    HOST = "0.0.0.0"
    PORT = 5000

    # Global network-related values, in seconds
    NET_TIMEOUT = 120
    NET_RETRY_INTERVAL = 30

    #DISTGITS = {"git+https://git.centos.org": ("git clone {repo_path}", "get_sources.sh")}
    SYSTEM = "koji"
    MESSAGING = "fedmsg"  # or amq
    MESSAGING_TOPIC_PREFIX = ["org.fedora-plct"]  # 修改为与 Fedmsg 配置一致
    KOJI_CONFIG = "/etc/module-build-service/koji.conf"
    KOJI_PROFILE = "koji"
    ARCHES = ["riscv64"]
    ALLOW_ARCH_OVERRIDE = False
    KOJI_REPOSITORY_URL = "https://openkoji.iscas.ac.cn/kojifiles"
    KOJI_TAG_PREFIXES = ["module", "scrmod"]
    KOJI_ENABLE_CONTENT_GENERATOR = True
    CHECK_FOR_EOL = False
    PDC_URL = "https://pdc.fedoraproject.org/rest_api/v1"
    PDC_INSECURE = False
    PDC_DEVELOP = True
    SCMURLS = ["https://src.fedoraproject.org"]
    YAML_SUBMIT_ALLOWED = True

    # How often should we resort to polling, in seconds
    # Set to zero to disable polling
    POLLING_INTERVAL = 600

    # Determines how many builds that can be submitted to the builder
    # and be in the build state at a time. Set this to 0 for no restrictions
    NUM_CONCURRENT_BUILDS = 5

    ALLOW_CUSTOM_SCMURLS = False

    RPMS_DEFAULT_REPOSITORY = " git+https://src.fedoraproject.org/rpms/"
    RPMS_ALLOW_REPOSITORY = True
    #RPMS_DEFAULT_CACHE = "http://pkgs.fedoraproject.org/repo/pkgs/"
    RPMS_ALLOW_CACHE = False

    MODULES_DEFAULT_REPOSITORY = "git+https://src.fedoraproject.org/modules/"
    MODULES_ALLOW_REPOSITORY = False
    MODULES_ALLOW_SCRATCH = True
    ALLOW_ONLY_COMPATIBLE_BASE_MODULES = True

    ALLOWED_GROUPS_TO_IMPORT_MODULE = set()

    # Available backends are: console and file
    LOG_BACKEND = "file"

    # Path to log file when LOG_BACKEND is set to "file".
    LOG_FILE = "/tmp/module_build_service.log"

    # Available log levels are: debug, info, warn, error.
    LOG_LEVEL = "debug"

    # Allow stream override
    ALLOW_STREAM_OVERRIDE_FROM_SCM = True

    # Settings for Kerberos
    KRB_KEYTAB = "/etc/mbs.keytab"
    KRB_PRINCIPAL = "mbs@GNULAB.ORG"

    # AMQ prefixed variables are required only while using 'amq' as messaging backend
    # Addresses to listen to
    AMQ_RECV_ADDRESSES = [
        "amqps://messaging.mydomain.com/Consumer.m8y.VirtualTopic.eng.koji",
        "amqps://messaging.mydomain.com/Consumer.m8y.VirtualTopic.eng.module_build_service",
    ]
    # Address for sending messages
    AMQ_DEST_ADDRESS = \
        "amqps://messaging.mydomain.com/Consumer.m8y.VirtualTopic.eng.module_build_service"
    AMQ_CERT_FILE = "/etc/module_build_service/msg-m8y-client.crt"
    AMQ_PRIVATE_KEY_FILE = "/etc/module_build_service/msg-m8y-client.key"
    AMQ_TRUSTED_CERT_FILE = "/etc/module_build_service/Root-CA.crt"

    # Disable Client Authorization
    NO_AUTH = True  # 测试或者内部使用可以关闭认证
    AUTH_METHOD = "kerberos"
    LDAP_URI = "ldap://koji.gnulab.org"
    LDAP_GROUPS_DN = "ou=group,dc=gnulab,dc=org"
    ADMIN_GROUPS = {"packageradmin"}
    ALLOWED_GROUPS = {"packager"}
    KOJI_CG_DEVEL_MODULE = True
    KOJI_PROXYUSER = True
    REBUILD_STRATEGY = 'only-changed'
    REBUILD_STRATEGY_ALLOW_OVERRIDE = True
    KOJI_CG_BUILD_TAG_TEMPLATE = "{}-modular-updates-candidate"
    KOJI_CG_DEFAULT_BUILD_TAG = "modular-updates-candidate"
    # Extra options set for newly created Koji tags
    KOJI_TAG_EXTRA_OPTS = {
        "mock.package_manager": "dnf",
        # This is needed to include all the Koji builds (and therefore
        # all the packages) from all inherited tags into this tag.
        # See https://pagure.io/koji/issue/588 and
        # https://pagure.io/fm-orchestrator/issue/660 for background.
        "repo_include_all": True,
        # Has been requested by Fedora infra in
        # https://pagure.io/fedora-infrastructure/issue/7620.
        # Disables systemd-nspawn for chroot.
        "mock.new_chroot": 0,
        # Works around fail-safe mechanism added in DNF 4.2.7
        # https://pagure.io/fedora-infrastructure/issue/8410
        "mock.yum.module_hotfixes": 1,
    }
    # DEFAULT_DIST_TAG_PREFIX = 'module_'

```

```
systemctl restart httpd
su mbs # 切换用户，防止文件权限问题
mbs-manager db upgrade
```

### Testing and using MBS

Before using MBS, the platform module needs to be imported.

```
su mbs
```

This is an example of a platform module

```
/home/mbs/platform-riscv-test.yaml 
------
document: modulemd
version: 1
data:
    name: platform
    stream: f37.0.0
    version: 3
    context: 00000000
    summary: Testing Rust dev base
    description: Testing Rust dev base
    license:
        module: [MIT]
    profiles:
        buildroot:
            rpms: [bash, bzip2, coreutils, cpio, diffutils, findutils, gawk, gcc, gcc-c++, grep, gzip, info, make, module-build-macros, patch,
redhat-rpm-config, rpm-build, sed, shadow-utils, tar, unzip, util-linux, which, xz]
        srpm-buildroot:
            rpms: [bash, gnupg2, module-build-macros, redhat-rpm-config, rpm-build, shadow-utils]
    xmd:
        mbs:
            buildrequires: {}
            commit: virtual
            requires: {}
            koji_tag: f37-build-side-32-misc-devel
            mse: TRUE
            virtual_streams: [f37]
```

Then we import it with the command-line management tool:

```
mbs-manager import_module /home/mbs/platform-riscv-test.yaml 
```

A module is defined by a YAML file; here is an example:

```yaml
---
document: modulemd
version: 2
data:
  name: zlib
  stream: '1.2.12'
  summary: zlib
  description: >
      zlib.
  license:
    module:
      - MIT
  dependencies:
  - buildrequires:
      platform: []
    requires:
      platform: []
  components:
    rpms:
      zlib:
        rationale: zlib
        ref: f37
        buildorder: 0
...
```

Use Wegt to send this YAML to the MBS server.

```
wget --quiet \
  --method POST \
  --header 'Content-Type: multipart/form-data; boundary=---011000010111000001101001' \
  --body-data '-----011000010111000001101001\r\nContent-Disposition: form-data; name="modulemd"\r\n\r\n---\ndocument: modulemd\nversion: 2\ndata:\n  name: zlib\n  stream: '\''1.2.12'\''\n  summary: zlib\n  description: >\n      zlib.\n  license:\n    module:\n      - MIT\n  dependencies:\n  - buildrequires:\n      platform: []\n    requires:\n      platform: []\n  components:\n    rpms:\n      zlib:\n        rationale: zlib\n        ref: f37\n        buildorder: 0\n...\r\n-----011000010111000001101001--\r\n' \
  --output-document \
  - 'http://127.0.0.1:18080/module-build-service/1/module-builds/?='
```
