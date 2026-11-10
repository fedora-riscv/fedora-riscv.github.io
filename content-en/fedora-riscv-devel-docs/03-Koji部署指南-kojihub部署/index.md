---
title: "Deploying kojihub"
slug: kojihub-deployment
date: 2024-09-10T00:00:00+00:00
tags:
    - Koji
translation: machine
sourceHash: "0767150bb2b89d941754ca10cea06e78"
---

<div align='center' ><font size='20'>Deploying Kojihub</font></div>

![img](./3.1.png)

# 0. Prerequisites

- Basic knowledge of installing SSL and its certificates (or Kerberos authentication)
- Basic use of PostgreSQL: creating a database and exporting tables with PostgreSQL
- Basic knowledge of configuring an HTTP server (Apache)
- Basics of yum / createrepo / mock, and of RPM packaging
- Basics of using the command line and simple use of the Koji CLI client

Note: the Koji directory needs a lot of space, configured in kojihub.conf. If Koji uses mock as the backend build tool, you will find that /var/lib/mock becomes very large. You need to adjust mock's default build directory in kojid.conf.

# 1. Deployment Preparation

a. Install dependencies

```shell
sudo dnf install postgresql-server mod_ssl  httpd
```

\* mod_python  mod_auth_kerb (for Kerberos authentication)

b. Install Koji

```shell
sudo dnf install koji-hub koji-web koji-utils
```

# 2. Software Configuration

Koji mainly supports Kerberos and SSL Certificate authentication. For basic command-line access, an ordinary username/password combination also works. But __kojiweb does not support username/password authentication,__ so kojiweb only works once either Kerberos or SSL Certificate authentication has been set up.

- Kerberos authentication: requires an already working Kerberos environment; the security credentials of the admin user must have been set up before the Koji user data is initialized;
- **SSL authentication: SSL certificates must be prepared for the xmlrpc service, the other Koji components, and the admin user.**

## Preparing the SSL Authentication Environment

In environments __without Kerberos support__, use __SSL certificates for authentication__ .

### Authentication Configuration (SSL)

For small internal deployments, it is simplest to use a self-signed CA to issue the certificates used for authentication.

![img](./3.2.png)

**Handling all the self-signed certificates under /etc/pki/koji**

```shell
sudo mkdir /etc/pki/koji
cd /etc/pki/koji
```

1. Create directories
   
   ```shell
   sudo mkdir {certs,confs,private}
   ```

2. Create the CA-related files
   
   - Base configuration template
     
     in the working directory (it can be __/etc/pki/koji__, but this is not required __), create the file openssl.cnf__
     
     ```shell
     vi openssl.conf
     ```
     
     The content is as follows:
     
     ```shell
     WORK                    = /etc/pki/koji
     RANDFILE                = .rand
     CANAME                    = koji
     
     [ca]
     default_ca              = ca_default
     [ca_default]
     dir                     = ${ENV::WORK}
     certs                   = $dir/certs
     crl_dir                 = $dir/crl
     database                = $dir/index.txt
     new_certs_dir           = $dir/newcerts
     certificate             = $dir/${ENV::CANAME}_ca_cert.crt
     private_key             = $dir/private/${ENV::CANAME}_ca_cert.key
     serial                  = $dir/serial
     crl                     = $dir/crl.pem
     x509_extensions         = usr_cert
     name_opt                = ca_default
     cert_opt                = ca_default
     default_days            = 3650
     default_crl_days        = 30
     default_md              = sha256
     preserve                = no
     policy                  = policy_match
     
     [policy_match]
     countryName             = match
     stateOrProvinceName     = match
     localityName            = match
     organizationName        = match
     organizationalUnitName  = optional
     commonName              = supplied
     emailAddress            = optional
     
     [req]
     default_bits            = 2048
     default_keyfile         = ${ENV::WORK}/private/${ENV::CANAME}_ca_cert.key
     default_md              = sha256
     distinguished_name      = req_distinguished_name
     x509_extensions         = v3_ca 
     # The extensions to add to the self signed cert
     string_mask             = MASK:0x2002
     
     [req_distinguished_name]
     
     [usr_cert]
     basicConstraints                = CA:FALSE
     nsComment                       = "OpenSSL Generated Certificate"
     subjectKeyIdentifier            = hash
     authorityKeyIdentifier          = keyid,issuer:always
     
     [v3_ca]
     subjectKeyIdentifier            = hash
     authorityKeyIdentifier          = keyid:always,issuer:always
     basicConstraints                = CA:true
     ```
   
   - Initialize the CA database files
     
     The CA certificate is the key/certificate pair used to sign other SSL certificates. When configuring the Koji components, the CA certificate used by both client and server programs comes from the one generated in this step. The CA certificate is placed in the /etc/pki/koji directory, and the certificates of the other components are placed in /etc/pki/koji/certs. **index.txt** records the information of all issued certificates.
     
     In the /etc/pki/koji directory,
     
     - create an empty file __index.txt__ for later use
     
     - create a text file serial to store the serial number, with initial content of two ASCII characters: 01
       
       ```shell
       sudo touch index.txt
       sudo vi serial
       ```
   
   - Create the CA certificate
     
     If you automate certificate generation with a script, you can refer to the following commands:
     
     ```shell
     WORK_DIR=/etc/pki/koji
     
     EXPIRE_DAYS=3650
     SSL_CONF_TEMPLATE=openssl.conf
     caname=koji
     CA_CERT_PRI_KEY=${WORK_DIR}/private/${caname}_ca_cert.key
     CA_CERT_CRT=${WORK_DIR}/${caname}_ca_cert.crt
     PASSPHRASE_FILE=pw.txt
     ## for your own instance, please change them
     SERVER_NAME=koji.tekkamanv.com
     COMMON_NAME=${SERVER_NAME}
     EMAIL_ADDR=tekkamanv@${SERVER_NAME}
     ORG_UNIT=Koji
     SSL_CONF_SUBJ_COM='/C=CN/ST=Guangdong/L=Shenzhen/O=TekkamanV'
     SSL_CONF_SUBJ="${SSL_CONF_SUBJ_COM}/OU=${ORG_UNIT}/CN=${COMMON_NAME}/emailAddress=${EMAIL_ADDR}"
     
     -----------------------------------------------------------------
     sudo openssl genrsa -out ${CA_CERT_PRI_KEY} 2048
     sudo openssl req -verbose -new -x509 -passout file:${PASSPHRASE_FILE} \
             -days ${EXPIRE_DAYS} \
             -config ${SSL_CONF_TEMPLATE} \
             -subj ${SSL_CONF_SUBJ} \
             -out ${CA_CERT_CRT}
     ```
     
     The commands above do not ask for confirmation of the certificate information, because all of it is already in the configuration file and on the command line.
     
     __The organizationUnitName (OU) and commonName (CN) need to be adjusted accordingly when generating certificates for the different components.__ For the CA certificate itself there is no special restriction on this information; using the server's FQDN as the commonName is recommended.
     
     - __FQDN__: (Fully Qualified Domain Name): a name that contains both the hostname and the domain name (joined by "."). For example, if the hostname is koji and the domain name is tekkamanv.com, the FQDN is koji.tekkamanv.com.

3. Issue the component certificates
   
   ![img](./3.3.png)
   
   - Example script for a simple component certificate issuing flow: cert-issue.sh
     
     ```shell
     #!/bin/bash
     WORK_DIR=/etc/pki/koji
     
     EXPIRE_DAYS=3650
     PASSPHRASE_FILE=pw.txt
     SSL_CONF_TEMPLATE=openssl.conf
     # if you change your certificate authority name to something else you will
     # need to change the caname value to reflect the change.
     caname=koji
     CA_CERT_PRI_KEY=${WORK_DIR}/private/${caname}_ca_cert.key
     CA_CERT_CRT=${WORK_DIR}/${caname}_ca_cert.crt
     
     # __HOST_NAME is equal to parameter one or the first argument when you actually
     # run the script
     ORG_UNIT=Koji
     SERVER_NAME=koji.tekkamanv.com
     __ORG_UNIT=${ORG_UNIT}
     __EMAIL_ADDR=${1}@${SERVER_NAME}
     __HOST_NAME=${1}
     __PRI_KEY=${WORK_DIR}/private/${__HOST_NAME}.key
     __CSR_FILE=${WORK_DIR}/certs/${__HOST_NAME}.csr
     __CRT_FILE=${WORK_DIR}/certs/${__HOST_NAME}.crt
     __PEM_FILE=${WORK_DIR}/${__HOST_NAME}.pem
     
     __COMMON_NAME=${1}
     SSL_CONF_SUBJ_COM='/C=CN/ST=Guangdong/L=Shenzhen/O=TekkamanV'
     __SSL_CONF_SUBJ="${SSL_CONF_SUBJ_COM}/OU=${__ORG_UNIT}/CN=${__COMMON_NAME}/emailAddress=${__EMAIL_ADDR}"
     
     -----------------------------------------------------------------
     sudo openssl genrsa \
         -out ${__PRI_KEY} 2048 \
     && \
     sudo openssl req -new -nodes -passin file:${PASSPHRASE_FILE} \
         -config ${SSL_CONF_TEMPLATE} \
         -subj ${__SSL_CONF_SUBJ} \
         -key ${__PRI_KEY} \
         -out ${__CSR_FILE} \
     && \
     sudo openssl ca -batch -passin file:${PASSPHRASE_FILE} \
         -config ${SSL_CONF_TEMPLATE} \
         -out ${__CRT_FILE} \
         -infiles ${__CSR_FILE} \
     && \
     sudo cat ${__CRT_FILE} ${__PRI_KEY}  | sudo tee ${__PEM_FILE} > /dev/null
     ```
     
     Pay attention to the common name (CN) when issuing component certificates:
     
     - **if the certificate is used for user authentication, use the user name;**
     - **if it is used for server authentication, use the server's hostname (domain name).**
     
     Before using the script to issue certificates, make sure the script is executable.
   
   - Issue certificates for the Koji components and users
     
     Every Koji component needs its own certificate to identify itself.
     
     - Server-side components (kojihub/kojiweb)
       
       __The kojihub and kojiweb certificates are server certificates that must pass client verification, so the certificate CN (common name) should be set to the server's FQDN__; otherwise client programs will report that the certificate's common name does not match the server hostname.
       
       **When generating the kojiweb certificate, all of its information (e.g. C, ST, L, O, CN) must be added to the [ProxyDNs configuration](#_AuthError 问题) in /etc/koji-hub/hub.conf.**
       
       To make them easy to tell apart, the OU (organizationalUnitName) of these two certificates can be set to kojihub and kojiweb respectively.
     
     - Client components (kojira/kojid/kojiadmin/koji_user)
       
       __The other certificates (such as kojira, kojid, the admin user and other users) are client certificates; their CN only needs to be set to the user name they use to log in to the server__, e.g. __the CN of the kojira certificate should be kojira.__ The reason is that the certificate's CN must match a user name in the koji database. When these components communicate with the server, if no user corresponding to the certificate's CN is found in the database, authentication fails and client access is rejected.
       
       **When the koji add-host command is used to add a builder, a user is added to the koji database (it appears in the builder list, but not in the user list). This user's name must be identical to the CN of the certificate the builder uses; otherwise the build host will be unable to access the kojihub server. Different common names (CN) must be used; using different emails or OUs is recommended!**
     
     | Admin user | sudo ./cert-issue.sh kojiadmin                                                                              |
     | ---------- | ----------------------------------------------------------------------------------------------------------- |
     | **koji** components | **sudo ./cert-issue.sh kojihub**<br />**sudo ./cert-issue.sh kojiweb**<br />**sudo ./cert-issue.sh kojira** |
   
   - Generate PKCS12 user certificates (for use in web browsers)
     
     A PKCS12 user certificate is prepared for users to log in to the koji site through kojiweb in a web browser.
     
     ```shell
     WORK_DIR=/etc/pki/koji
     # if you change your certificate authority name to something else you will
     # need to change the caname value to reflect the change.
     caname=koji
     CA_CERT_CRT=${WORK_DIR}/${caname}_ca_cert.crt
     
     __USER_NAME=${1}
     __PRI_KEY=${WORK_DIR}/private/${__USER_NAME}.key
     __CRT_FILE=${WORK_DIR}/certs/${__USER_NAME}.crt
     __P12_FILE=${WORK_DIR}/certs/${__USER_NAME}_browser_cert.p12
     
     ---------------------------------------------------------------
     sudo openssl pkcs12 -export \
         -inkey ${__PRI_KEY} \
         -in ${__CRT_FILE} \
         -CAfile ${CA_CERT_CRT} \
         -out ${__P12_FILE}
     ```

4. Client certificate configuration
   
   - Configure certificates for command-line users
     
     Command-line users can manage the koji system with the koji command-line tool.
     
     __Taking kojiadmin as an example__, after creating the kojiadmin user (a user in the koji system, and generating the user certificate),
     
     - the koji command-line tool uses the global configuration file /etc/koji.conf by default; copy this file to the ~/.koji/ directory and adjust it as needed.
     - copy the CA certificate and your own user certificate to the ~/.koji directory of the system user (a regular user is also fine)
     
     ```shell
     mkdir ~/.koji
     cp  /etc/koji.conf  ~/.koji/
     # 适当修改koji.conf，注意下面的证书和CA路径会出现在配置中
     cp /etc/pki/koji/kojiadmin.pem ~/.koji/client.crt
     # 注意：用户证书需要用 PEM 文件而不是 CRT
     cp /etc/pki/koji/koji_ca_cert.crt ~/.koji/serverca.crt
     ```
     
     Configuring a new user works the same way: copy the configuration file, certificate and CA certificate to the corresponding locations; see Configuring New Users.
   
   - Configure the user certificate for a web browser
     
     For generating the PKCS12 user certificate, see Generate PKCS12 user certificates (for use in web browsers), and __import the certificates (user and CA) before use.__
     
     **Currently only Firefox has been verified to work with certificate login; Chrome does not support certificate login.**
     
     \- - **First make sure the certificate files are readable by the current user.** - Go to the __“Certificates”__ settings on the __about:preferences#privacy__ page, click __“View Certificates…”__ to open the “__Your Certificates” tab__ of the “Certificate Manager”. Click **“Import...”** and select the p12 file you just created.
     
     ![img](./3.4.png)
     
     ![img](./3.5.png)
     
     Possible problems and solutions:
     
     - Post-Handshake problem
       
       If the following warning appears when you click login, the browser does not currently support Post-Handshake,
       
       ```shell
       Forbidden
       You don't have permission to access this resource.Reason: Cannot perform Post-Handshake Authentication.
       ```
       
       For Firefox, we can enable this feature as follows; **but Chrome does not support this feature, so logging in from Chrome is not supported for now.**
       
       ```shell
       Firefox: about:config
       security.tls.enable_post_handshake_auth -------> true
       ```
       
       ![img](./3.6.png)
     
     - AuthError problem
       
       ```shell
       An error has occurred in the web interface code. This could be due to a bug or a configuration issue.
       koji.AuthError: unable to obtain a session (ssl auth failed: koji.AuthError: emailAddress=kojiweb@koji.tekkamanv.com,CN=koji.tekkamanv.com,OU=kojiweb,O=TekkamanV,L=Shenzhen,ST=Guangdong,C=CN is not authorized to login other users )
       ```
       
       Fix: assign the **similar statement** above **verbatim** to the ProxyDNs variable in /etc/koji-hub/hub.conf, for example:
       
       ```shell
       # vi /etc/koji-hub/hub.conf
       DNUsernameComponent = CN
       ProxyDNs = emailAddress=kojiweb@koji.tekkamanv.com,CN=koji.tekkamanv.com,OU=kojiweb,O=TekkamanV,L=Shenzhen,ST=Guangdong,C=CN
       
       # 注：当前版本mod_ssl（大于2.3.11）的分割符为“，”，老版本（小于2.3.11）的为“/”。
       ```
     
     - server secret not configured problem
       
       ```shell
       An error has occurred in the web interface code. This could be due to a bug or a configuration issue. 
       koji.AuthError: Unable to authenticate, server secret not configured 
       ```
       
       Fix: in /etc/kojiweb/web.conf, uncomment “Secret = CHANGE_ME”; the value after it can be anything.
       
       vi /etc/kojiweb/web.conf
       
       ```shell
       # This must be CHANGED to random value and uncommented before deployment
        #Secret = CHANGE_ME
       Secret = tekkamanv
       ```
       
       Then restart the web services.
       
       ```shell
       [root@tekkamanv koji]# systemctl restart httpd postgresql
       ```

## Preparing the Database

1. Create the koji user for managing the database

```shell
sudo useradd koji
#sudo passwd koji
```

The koji account's sudo privilege is only used when initializing the database, so no password needs to be set; just switch over with sudo -iu from an account that has sudo privilege.

2. Initialize the database software and enable the service:

```shell
[tekkamanninja@Samantha ~]$ sudo postgresql-setup initdb
WARNING: using obsoleted argument syntax, try --help
WARNING: arguments transformed to: postgresql-setup --initdb --unit postgresql
* Initializing database in '/var/lib/pgsql/data'
* Initialized, logs are in /var/lib/pgsql/initdb_postgresql.logsudo [tekkamanninja@Samantha ~]$ sudo systemctl enable --now postgresql
Created symlink /etc/systemd/system/multi-user.target.wants/postgresql.service → /usr/lib/systemd/system/postgresql.service.
```

3. Set up the database environment for koji

Configuring for koji takes the following steps:

- **Create the koji database user**
- **Create the koji database**
- **Set a password for the koji database user**
- **Import the koji database schema**

```shell
#建立 koji 数据库用户
[tekkamanninja@Samantha ~]$ sudo -iu postgres
[postgres@Samantha ~]$ createuser --no-superuser --no-createrole --no-createdb koji
#建立 koji 数据库
[postgres@Samantha ~]$ createdb -O koji koji
#为 koji 数据库用户设置密码
[postgres@Samantha ~]$ psql -c "alter user koji with encrypted password 'tekkamanv';"
ALTER ROLE
[postgres@Samantha ~]$ exit
logout
```

a. **Configure the database service**

Modify /var/lib/pgsql/data/pg_hba.conf as follows:

```shell
#TYPE   DATABASE    USER    CIDR-ADDRESS      METHOD
host    koji        koji    127.0.0.1/32      trust
host    koji        koji     ::1/128          trust
#如果要使用 UNIX socket 和数据库通信（这种方式下，Koji组件的配置文件中 DBHost 选项不能进行设置），可以使用这样的配置：
local   koji        apache                    trust
local   koji        koji                      trust
```

- **If the server also has an external IP address, you can additionally add:**

```shell
#TYPE   DATABASE    USER    CIDR-ADDRESS      METHOD
host    koji        koji    $IP_ADDRESS/32    trust
```

- **Note: if password authentication for database access is mandatory, change trust to md5 in the configuration above**

Add the following at a suitable place in /var/lib/pgsql/data/postgresql.conf: listen on all network interfaces.

```shell
listen_addresses = '*’
```

- **Tuning for highly concurrent access:**

```shell
max_connections = 512            # (change requires restart)
superuser_reserved_connections = 3    # (change requires restart)
```

Reference : https://www.cnblogs.com/wy123/p/14087274.html

- **Restart the database service**

To make the configuration take effect, have the database re-read its configuration files:

```shell
sudo systemctl restart postgresql
#sudo systemctl reload postgresql
[tekkamanninja@Samantha ~]$ sudo -iu koji
#导入koji数据库模版schema:
[koji@Samantha ~]$ psql koji koji < /usr/share/doc/koji/docs/schema.sql 
...
#进入数据库交互模式添加'kojiadmin'用户，此方法仅限ssl认证:
[koji@Samantha ~]$ psql
psql (13.4)
Type "help" for help.

koji=> insert into users (name, status, usertype)
koji-> values ('kojiadmin', 0, 0);
INSERT 0 1
#赋予指定用户管理权限：
#使用下面的 sql 语句可以为指定用户（user_id）赋予管理权限：
koji=> insert into user_perms (user_id, perm_id, creator_id)
#values (<user_id>, 1, <creator_id/user_id>); 
koji-> values (1, 1, 1);
INSERT 0 1
#其中初始管理员的user_id和creator_id默认应该是1，可使用以下方法来读取用户表查看id。
koji=> select * from users;
id |   name    | password | status | usertype 
----+-----------+----------+--------+----------
1 | kojiadmin |          |      0 |        0
(1 row)

koji=> quit
[koji@Samantha ~]$ exit
logout
[tekkamanninja@Samantha ~]$  
```

b. **Initialize the Koji-specific database**

The Koji admin user (__kojiadmin__) must be added to the database manually through an SQL statement. After the admin user has been added, other user operations (adding and deleting users, changing user permissions, etc.) can be done with koji commands.

However, if simple username and password authentication is used, setting or changing a user's password still has to be done by operating on the database directly with SQL statements, because the koji command provides no interface for operating on user passwords.

The SQL statement for adding the Koji admin user differs depending on the authentication method.

c. **Enable the database sweep timer (?)**

```shell
[tekkamanninja@Samantha ~]$ sudo systemctl enable --now koji-sweep-db.timer
[sudo] password for tekkamanninja: 
Created symlink /etc/systemd/system/timers.target.wants/koji-sweep-db.timer → /usr/lib/systemd/system/koji-sweep-db.timer.
```

d. **Restart the database**

```shell
sudo systemctl restart postgresql
```

Issue:

```shell
[tekkamanninja@Samantha development]$ koji moshimoshi 
2022-07-26 21:03:42,414 [ERROR] koji: AuthError: unable to obtain a session (ssl auth failed: koji.ServerOffline: database outage)
```

**As a test, you can try to fix this by “restarting the database”.**

## Configuring Koji hub

1. Modify the basic HTTP settings, /etc/httpd/conf.d/kojihub.conf

This file needs some adjustment for the chosen authentication scheme, but not much has to change; see the comments in the configuration file. **The following configuration needs to be uncommented.**

```shell
<Location /kojihub/ssllogin>
SSLVerifyClient require
SSLVerifyDepth  10
SSLOptions +StdEnvVars
</Location>
```

2. Modify the koji-hub configuration file, /etc/koji-hub/hub.conf

This is the main configuration file of Koji-hub. It first needs basic information such as the database and KojiWebURL. The authentication settings are also in this file.

```shell
##  Basic options  ##
DBName = koji
DBUser = koji
#DBHost = db.example.com
DBHost = 127.0.0.1
#DBPort = 5432
#DBPass = example_password
DBPass = tekkamanv
KojiDir = /mnt/koji
LoginCreatesUser = On
KojiWebURL = http://koji.tekkamanv.com/koji

-------------------------------------------------------------

#安全验证配置: 使用 SSL 证书验证时, mod_ssl （版本大于 2.3.11）配置：
DNUsernameComponent = CN
ProxyDNs = emailAddress=kojiadmin@koji.tekkamanv.com,CN=kojiadmin,OU=Koji,O=TekkamanV,ST=Guangdong,C=CN
```

3. Modify the SSL configuration /etc/httpd/conf.d/ssl.conf

If SSL certificate authentication is used, you need to specify where the certificate files are, and enforce SSL client certificate checking, for example:

```shell
SSLCertificateFile /etc/pki/koji/certs/kojihub.crt
SSLCertificateKeyFile /etc/pki/koji/private/kojihub.key
SSLCertificateChainFile /etc/pki/koji/koji_ca_cert.crt
SSLCACertificateFile /etc/pki/koji/koji_ca_cert.crt
#SSLVerifyClient require
#SSLVerifyDepth  10
```

4. Create the directory /mnt/koji and restart the web server

In the configuration example above, **KojiDir is set to /mnt/koji**. If you change this path, you still need to create a /mnt/koji symlink pointing to the actual Koji file directory. Before deploying the other Koji components, you need to create the basic structure of this directory and set the permissions:

```shell
sudo mkdir -p /mnt/koji/{packages,repos,repos-dist,scratch,work}
sudo chown -R apache:apache   /mnt/koji/*
sudo systemctl restart httpd
sudo systemctl enable --now httpd
```

5. Configure SELinux

If __SELinux is running in Enforcing mode__ on the server, some configuration is needed:

- allow apache to access the PostgreSQL database;
- allow apache to write certain files on disk.

Reference configuration:

```shell
[tekkamanninja@Samantha ~]$ sudo setsebool -P httpd_can_network_connect_db=1 allow_httpd_anon_write=1 httpd_can_network_connect=1
[sudo] password for tekkamanninja: 
[tekkamanninja@Samantha ~]$ sudo chcon -R -t public_content_rw_t /mnt/koji/*
```

- If /mnt/koji is a mounted NFS share, httpd_use_nfs must also be set:

```shell
sudo setsebool -P httpd_use_nfs=1
```

- If the following error occurs:

```shell
Error
The web interface is having difficulty communicating with the main server. This most likely indicates a network issue. 
requests.exceptions.ConnectionError: HTTPConnectionPool(host='koji.tekkamanv.com', port=80): Max retries exceeded with url: /kojihub (Caused by NewConnectionError('<urllib3.connection.HTTPConnection object at 0x7fb04c7c0160>: Failed to establish a new connection: [Errno 13] Permission denied')) 
```

Fix:

```shell
sudo setsebool -P httpd_can_network_connect=1
```

6. Configure the koji CLI and test koji-hub

After completing the configuration above, in theory __Koji-hub should work once the apache service is restarted, and can be checked with the koji command described below.__ (kojiweb has not been configured at this point)

The koji command-line tool is the standard client tool of the Koji system; most work can be done with the koji command.

- Default user configuration file ~/.koji/config
- Global configuration file /etc/koji.conf

```shell
mkdir -p ~/.koji
cd ~/.koji/
cp /etc/koji.conf config
vi config

---------------------------------------------
[koji]

;url of XMLRPC server
server = http://koji.tekkamanv.com/kojihub

;url of web interface
weburl = http://koji.tekkamanv.com/koji

;url of package download site
topurl = http://koji.tekkamanv.com/kojifiles

;path to the koji top directory
topdir = /mnt/koji

; fedora uses kerberos auth
; authtype = kerberos
authtype = ssl

;configuration for SSL authentication

;client certificate
cert = ~/.koji/client.crt

;certificate of the CA that issued the HTTP server certificate
serverca = ~/.koji/serverca.crt
```

- CA certificate and user certificate: see ●4.a Configure certificates for command-line users

If the configuration succeeded, you can test whether the koji client can connect to koji-hub with the following command:

```shell
[tekkamanninja@Samantha ~]$ koji moshimoshi 
góðan daginn, kojiadmin!

You are using the hub at https://koji.tekkamanv.com/kojihub
Authenticated via client certificate /home/tekkamanninja/.koji/client.crt
```

If you do not get a response like the one above, contact your koji administrator to add the corresponding account and obtain the certificate files, etc.

## Deploying koji web

This is the main configuration file of koji-web. It must specify the koji-hub service, the koji file directory and kojiweb's own URL; the authentication-related settings are also required.

The Secret in the configuration file must be configured; just specify any particular string, see the server secret not configured problem

1. Changes to /etc/kojiweb/web.conf:
   
   ```shell
   SiteName = koji
   KojiHubURL = http://koji.tekkamanv.com/kojihub
   KojiFilesURL = http://koji.tekkamanv.com/kojifiles
   
   # SSL authentication options
   # 其中 WebCert 对应的文件必须同时包含公钥和私钥信息，也就是pem文件
   WebCert = /etc/pki/koji/kojiweb.pem
   KojiHubCA = /etc/pki/koji/koji_ca_cert.crt
   # This must be CHANGED to random value and uncommented before deployment
   # Secret = CHANGE_ME
   Secret = tekkamanv
   ```
   
   Note: __no line here may start with a space, otherwise an error like the following occurs:__
   
   ```shell
   An error has occurred in the web interface code. This could be due to a bug or a configuration issue. 
   koji.AuthError: configuration error: set WebAuthType or on of WebPrincipal/WebCert options
   ```

2. Changes to /etc/httpd/conf.d/kojiweb.conf
   
   Adjust according to the type of authentication; just configure it according to the comments in the configuration file.
   
   - koji-web SSL authentication: enable SSL authentication for /koji/login.
     
     ```shell
     # uncomment this to enable authentication via SSL client certificates
     <Location /koji/login>
         SSLVerifyClient require
         SSLVerifyDepth  10
         SSLOptions +StdEnvVars
     </Location>
     ```
     
     Changes to /etc/httpd/conf.d/ssl.conf (when everything is on the same machine, this was already configured during the koji-hub stage)
     
     ```shell
     SSLCertificateFile /etc/pki/koji/certs/kojihub.crt
     SSLCertificateKeyFile /etc/pki/koji/private/kojihub.key
     SSLCertificateChainFile /etc/pki/koji/koji_ca_cert.crt
     SSLCACertificateFile /etc/pki/koji/koji_ca_cert.crt
     ```

3. Filesystem-related configuration
   
   For Koji-web to work properly, the access permissions of the /mnt/koji directory must be changed so that all the components can access it. This directory appears in the following configuration files:
   
   - **KojiFilesURL in /etc/kojiweb/web.conf**
   - **topurl in /etc/kojid/kojid.conf**
   - **topurl in /etc/koji.conf**
   
   The apache configuration is as follows (note: the access control format differs between apache versions): **/etc/httpd/conf.d/kojihub.conf**
   
   ```shell
   Alias /kojifiles /mnt/koji/
   <Directory "/mnt/koji/">
       Options Indexes SymLinksIfOwnerMatch
       #If your top /mnt/koji directory is not owned by the httpd user, then
       #you will need to follow all symlinks instead, e.g.
       #Options Indexes FollowSymLinks
       AllowOverride None
       IndexOptions +NameWidth=*
       <IfVersion < 2.4>
           Order allow,deny
           Allow from all
       </IfVersion>
       <IfVersion >= 2.4>
           Require all granted
       </IfVersion>
   </Directory>
   ```

4. Verify that Koji-web works
   
   After restarting the httpd service, visit the koji-web address and confirm that you can access it, log in, and perform the various operations.
   
   - Testing note: temporarily turning off the security mechanisms
     
     | Enable the firewall | sudo systemctl start firewalld                                                                            |
     | --------- | --------------------------------------------------------------------------------------------------------- |
     | Option1   | sudo firewall-cmd --add-service=https sudo firewall-cmd --add-service=http                                |
     | Option2   | sudo firewall-cmd --add-service=https **--permanent**sudo firewall-cmd --add-service=http **--permanent** |
     | Option3   | sudo firewall-cmd --add-port=443/tcpsudo firewall-cmd --add-port=80/tcp                                   |
     | Disable the firewall completely | sudo systemctl stop firewalld                                                                             |
     | Set SELinux | sudo setenforce permissive                                                                                |
   
   - Turn on debug information
     
     When the page shows “Full tracebacks disabled”, kojiweb debugging is not enabled. You can enable the debug information by uncommenting the following and restarting httpd:
     
     ```shell
     sudo vi /etc/kojiweb/web.conf
     # PythonDebug = True
     sudo systemctl restart httpd
     ```

## Configuring and Enabling kojira

1. Install Kojira
   
   ```shell
   sudo yum install koji-utils
   ```

2. Add a user for kojira in koji and configure it
   
   ```shell
   koji add-user kojira
   #kojira 用户需要拥有 repo 权限
   koji grant-permission repo kojira
   ```
   
   - Additional notes:
     
     - kojira needs read and write access to /mnt/koji;
     
     - only one instance of kojira can run at a time;
     
     - it is not recommended to put kojira and kojid on the same server, because kojid only needs read access to /mnt/koji;
     
     - when a new tag is added, kojira may need to be restarted to recognize it correctly.
   
   - Set the koji-hub URL and the authentication configuration
     
     Using SSL certificate authentication: /etc/kojira/kojira.conf
     
     ```shell
     ;在 /etc/kojira/kojira.conf 中添加 koji-hub 的 url 地址：
     server=http://koji.tekkamanv.com/kojihub
     ;使用 SSL 证书验证
     cert = /etc/pki/koji/kojira.pem
     serverca = /etc/pki/koji/koji_ca_cert.crt
     ```
   
   - /etc/sysconfig/kojira
     
     kojira needs read and write access to the /mnt/koji/repos directory. If the permissions of this directory cannot be adjusted (for example an NFS share configured with root_squash), you can set RUNAS= in /etc/sysconfig/kojira to specify a user that has the required permissions.

3. Enable and start the service
   
   ```shell
   sudo systemctl enable --now kojira
   ```

## Configuring New Users

After the koji system is in use, users need to be added and given different permissions (administrator, engineer); koji manages this through its “permissions” system. Configuring a new user takes the following steps:

1. Generate the user certificate
   
   Please refer to [Issuing certificates for Koji components and admin users] and [Generate PKCS12 user certificates (for use in web browsers)].
   
   > (Note: all the koji commands below are run as the Koji system administrator)

2. Add the user
   
   ```shell
   koji add-user koji_user
   ```

3. Configure user permissions
   
   ```shell
   koji grant-permission <Permission name> koji_user
   ```
   
   The Permission name here can be obtained with the following command:
   
   ```shell
   [tekkamanninja@Samantha ~]$ koji -p openkoji list-permissions 
   Permission name      Description                                       
   -----------------------------------------------------------------------
   admin                Full administrator access. Perform all actions.
   appliance            Create appliance builds - deprecated.
   build             
   dist-repo            Create a dist-repo.
   host                 Add, remove, enable, disable hosts and channels.
   image                Start image tasks.
   image-import         Import image archives.
   livecd               Start livecd tasks.
   maven-import         Import maven archives.
   repo                 Manage repos: newRepo, repoExpire, repoDelete, repoProblem.
   sign                 Import RPM signatures and write signed RPMs.
   tag                  Manage packages in tags: add, block, remove, and clone tags.
   target               Add, edit, and remove targets.
   win-admin            The default hub policy rule for "vm" requires this permission to trigger Windows builds.
   win-import           Import win archives.
   ```

## Database Upgrade (Koji Version Upgrade)

A koji version upgrade may require the database to be upgraded manually to match the new koji code. The steps are briefly summarized below:

1. Get the version difference
   
   ```shell
   [tekkamanninja@Samantha ~]$ rpm -q koji
   koji-1.27.1-1.fc35.noarch
   [tekkamanninja@Samantha ~]$ sudo dnf update
   [tekkamanninja@Samantha ~]$ rpm -q koji
   koji-1.29.1-3.fc35.noarch
   ```
   
   So in this example koji was upgraded from 1.27 to 1.29. After the upgrade, the following problem may appear:
   
   ```shell
   [tekkamanninja@Samantha ~]$ koji list-permissions
   2022-08-14 15:58:04,070 [ERROR] koji: Fault: <Fault 1: '<class \'psycopg2.errors.UndefinedColumn\'>: column "description" does not exist\nLINE 1: SELECT id, name, description FROM permissions\n                         ^\n'>
   ```
   
   This is exactly caused by the database not being upgraded. In the example the version span is small and only one non-critical little command is affected, but if the span is large, the whole koji system may fail to work.

2. Upgrade the database
   
   koji itself provides methods and instructions for database upgrades: [migrations](https://docs.pagure.org/koji/migrations/migrations/)
   
   For example, to upgrade from 1.27 to 1.29, we need to read in turn:
   
   - [Migrating to Koji 1.28](https://docs.pagure.org/koji/migrations/migrating_to_1.28/)
   - [Migrating to Koji 1.29](https://docs.pagure.org/koji/migrations/migrating_to_1.29/)
   
   What actually needs to be done is mainly to run, in order:
   
   Even if “/usr/share/doc/koji/docs/schema-upgrade-1.28-1.29.sql” is a file that does nothing.
   
   ```shell
   psql koji koji  </usr/share/doc/koji/docs/schema-upgrade-1.27-1.28.sql
   psql koji koji  </usr/share/doc/koji/docs/schema-upgrade-1.28-1.29.sql
   ```
   
   After the upgrade is complete, it is best to restart the services:
   
   ```shell
   sudo service postgresql restart
   sudo service httpd restart
   sudo service kojira restart
   sudo service kojid restart
   ```

# 3. koji Troubleshooting (TODO, to be verified)

## Rebuilding the koji Database: Drop It and Reconfigure

- Note: make sure postgresql, httpd, kojid and kojira are running

### Deleting the Database

```shell
dropdb -U koji koji
```

If you get the error “is being used”, stop apache first, restart postgresql, then try again

### Recreating the Database

```shell
su
su - postgres
createdb -O koji koji
exit
#postgres
exit
#root
psql koji koji < /usr/share/doc/koji/docs/schema.sql
```

### Adding the Necessary Data

```shell
psql -U koji koji
insert into users (name, status, usertype) values ('kojiadmin', 0, 0);
select * from users;
insert into user_perms (user_id, perm_id,creator_id) values (1, 1,1);
exit koji
```

## Removing Other Settings

```shell
cd /mnt/koji
rm -rf {packages,repos,work,scratch}/*
rm -rf /var/lib/mock/*
service httpd restart
```

## Rebuilding Other Configuration

```shell
su - kojiadmin
koji add-user kojira
koji grant-permission repo kojira
koji add-host kojibuilder1 mips64el
koji add-host-to-channel kojibuilder1 createrepo
capacity
psql -U koji koji
select (id, name, capacity) from host;
update host set capacity = 16 where id = 1;
select (id, name, capacity) from host; // 检查是否被修改
exit koji
```

## Restarting Services

### Server Side

```shell
service postgresql restart
service nfs restart
service httpd restart
service kojira restart
#sudo systemctl restart libvirtd
#sudo systemctl restart systemd-resolved
```

### Builder Side

```shell
service kojid restart
```
