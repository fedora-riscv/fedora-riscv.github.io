---
title: "Building ROS 2 on Fedora"
slug: fedora-ros2-build-guide
date: 2024-09-10T00:00:00+00:00
translation: machine
sourceHash: "89a33659870c3e86f901dc2420d761c0"
---

# Building ROS 2 on Fedora

## **Preparation**

First, the dependencies:

```
sudo dnf install --skip-broken \
  cmake \
  cppcheck \
  eigen3-devel \
  gcc-c++ \
  liblsan \
  libXaw-devel \
  libyaml-devel \
  make \
  opencv-devel \
  patch \
  python3-colcon-common-extensions \
  python3-coverage \
  python3-devel \
  python3-empy \
  python3-nose \
  python3-pip \
  python3-pydocstyle \
  python3-pyparsing \
  python3-pytest \
  python3-pytest-cov \
  python3-pytest-mock \
  python3-pytest-runner \
  python3-rosdep \
  python3-setuptools \
  python3-vcstool \
  poco-devel \
  poco-foundation \
  python3-flake8 \
  python3-flake8-import-order \
  redhat-rpm-config \
  uncrustify \
  wget \ 
  console-bridge \
  spdlog \
  python3-numpy
```

Dependencies that cannot be installed can be skipped with `--skip-broken`.

After the dependencies are installed, import the source code:

```
mkdir -p ~/ros2_rolling/src
cd ~/ros2_rolling
vcs import --input https://raw.githubusercontent.com/ros2/ros2/rolling/ros2.repos src
```

Then install some dependencies that ROS manages itself

```
sudo dnf update

sudo rosdep init
rosdep update
rosdep install --from-paths src --ignore-src -y --skip-keys"asio cyclonedds fastcdr fastrtps ignition-cmake2 ignition-math6 python3-babeltrace python3-mypy rti-connext-dds-6.0.1 urdfdom_headers"
```

## **Building**

ROS uses colcon as its own build system; colcon needs to be run in a suitable working directory.

```
cd ~/ros2_rolling/
colcon build --symlink-install--cmake-args -DTHIRDPARTY_Asio=ON --no-warn-unused-cli
```

Also, the build takes a long time. In an environment such as SSH where the terminal may be closed, consider using Tmux or GNU Screen.

## **Some Pitfalls**

### **Cleaning the Cache**

ROS2's build system is rather crude: some steps patch the source code in place, and some partial build products are not rebuilt even when they are faulty. If the build fails midway, you can delete these products and the downloaded sources and let the build system download or generate those files again.

Here are a few packages that I had to regenerate:

```
# 提示 Patch 应用失败
rm -rf ~/ros2_rolling/{build,install}/uncrustify_vendor
# 提示与 atomic 相关的连接错误
rm -rf ~/ros2_rolling/{build,install}/osrf_testing_tools_cpp
# 提示源文件不存在
rm -rf ~/ros2_rolling/{build,install}/rviz_ogre_vendor
```

### **Mimick**

Mimick is a dependency of ROS2. It does not natively support Riscv64 and needs a patch. Currently a third-party contributor has submitted a PR upstream that adds Riscv64 support, but it has not been merged.

### **Fedora Environment Variables**

Also, for some unknown reason, building `qt_gui_cpp` requires setting some RPM-related environment variables. This problem is not specific to one architecture.

```
export RPM_ARCH=riscv64 #取决于你的架构，x86_64 也有这个问题
export RPM_PACKAGE_RELEASE="1"
export RPM_PACKAGE_VERSION="1.0"
export RPM_PACKAGE_NAME="foobar-fedora"
```

I suspect that some dependency packaged by Fedora may have a problem.

### **Atomic Inline Functions**

On Riscv64 the atomic functions are not inlined, so the compiler has to be told to link them manually.

```
export CFLAGS="-latomic" ; exportLDFLAGS="-latomic" ; exportCXXFLAGS="-latomic"
```

Or

```
export CFLAGS="$CFLAGS --as-needed -latomic";
```

### **Network Proxy**

The Colcon build needs to download third-party sources, and you may run into network problems. Here is an example of setting the HTTP proxy environment variables; adjust it to your actual situation.

```
ip=127.0.0.1&&port=9080&&export http_proxy=http://$ip:$port&&export https_proxy=http://$ip:$port
```

If you use SSH, the SSH command can forward a local port to the remote side, for example:

```
ssh -R 9080:127.0.0.1:9080 -p 59000 tux@remote-server
```

This command forwards local port 9080 to port 9080 on the remote side.

### Relocating the Build Directory

ROS2 hard-codes some paths in its environment scripts, so moving the built files may break them. The build above was done inside the user's home directory, and different users may have different home directory paths. In this case you can use a bind mount, fuse bindfs or a symbolic link.

## Testing

### Demo

To run ROS2, you first need to apply some environment settings.

```
# Replace ".bash" with your shell if you're not using bash
# Possible values are: setup.bash, setup.sh, setup.zsh
. ~/ros2_rolling/install/local_setup.bash
```

Then open two terminals and apply these environment settings in both.

In one terminal, run:

```
ros2 run demo_nodes_cpp talker
```

In the other terminal, run:

```
ros2 run demo_nodes_py listener
```

If ROS2 is set up correctly, `listener` should receive the messages published by `talker`.

ROS2 also ships some more complex demos, some of which need a GUI environment. Before testing those examples, set up the graphical environment first.

### Unit Tests

Colcon has a tool for running unit tests, which can run the tests for the whole of ROS2.

```
colcon test --ctest-args tests
```

Afterwards, the test logs are left in the working directory.
