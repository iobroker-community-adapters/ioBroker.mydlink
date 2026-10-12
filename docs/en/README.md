![Logo](../../admin/mydlink.png)
# ioBroker.mydlink

MyDlink Adapter for ioBroker. 
------------------------------------------------------------------------------

Allows to control power sockets or motion detectors from [D-Link](https://eu.dlink.com/uk/en/for-home/smart-home) from within ioBroker. 

**This adapter uses Sentry libraries to automatically report exceptions and code errors to the developers.** For more details and for information how to disable the error reporting see [Sentry-Plugin Documentation](https://github.com/ioBroker/plugin-sentry#plugin-sentry)! Sentry reporting is used starting with js-controller 3.0.
This also helps with supporting new devices.

Currently tested devices:

| Model | Type  | Image |
| :---: | :---: | :---: |
| DSP-W215 | Smart Plug (socket, temperature, current) **Needs polling** | ![Image](media/DSP_W215.png) |
| DSP-W115 | Smart Plug (socket) | ![Image](media/DSP_W115.png) | 
| DCH-S150 | Motion Detector (last motion detected) **Needs polling** | ![Image](media/DCH_S150.png) |
| DSP-W245 | Smart Power Strip (4 sockets) **Needs polling** | |

The adapter polls the devices. Sensor readings, motion detection and switching with the buttons of the device are delayed
by the poll interval (can be set per device). The newer devices (DSP-W115, DSP-W245) do not report switching or power
consumption to the adapter by themselves, see [Events and power measurement](https://github.com/Garfonso/dlinkWebSocketClient#events-and-power-measurement).

**Not supported:** DSP-W118. Its local interface does not allow to switch the relay, see [analysis](../DSP-W118-analysis.md).

#### Configuration:
Devices are managed in the device manager, either in the adapter settings or in the device manager of admin:
* **Add detected device**: devices announced in the network are offered for selection. Enter the PIN.
* **Add device by IP**: for devices that were not detected. Enter IP address and PIN.
* Every device can be edited, enabled / disabled and deleted. Deleting a device also deletes its objects.

Settings of a device:

<table>
<tr><td>Name</td><td>set a name here, must be unique (for mydlink devices)</td></tr>
<tr><td>IP</td><td>fill in IP address here, hostname should also work</td></tr>
<tr><td>PIN</td><td>PIN is printed on a sticker on the device, probably at the bottom. Can be TELNET for DSP-W115, see below.<br />The PIN is stored encrypted and can only be changed in the device manager.</td></tr>
<tr><td>Poll interval</td><td>per device poll interval<br /> Set 0 to disable polling. <br /><b>Recommendation:</b> Set a fast poll interval for sensors and a longer one for plugs.</td></tr>
<tr><td>enable</td><td>if not enabled, will not be polled or controlled. <br />Devices that are not plugged in can be disabled to avoid network traffic and error messages in the log.</td></tr>
<tr><td>NTP server</td><td>only older devices like DSP-W215 and DCH-S150: time server that is set on the device. Empty keeps the setting of the device.<br />These devices use ntp1.dlink.com. Without correct time the timestamps of the motion detector are wrong, so a local time server (e.g. your router) is a good choice.</td></tr>
</table>

#### Settings of the motion detector (DCH-S150)
The states of the motion detector also allow to change its settings:
* `sensitivity`: sensitivity of the sensor, 0 - 100.
* `backoff`: time in seconds after a detection, in which the detector does not report a new detection. The device uses 30 seconds by default. With a short time (e.g. 1 - 5 seconds) and a short poll interval new motion is detected much earlier.
* `detectionEnabled`: switches motion detection on or off.

Every change of the configuration restarts the adapter.

The adapter does not interfere with the use of the app.

## Setup of DSP-W115

DSP-W115 and other *newer* devices use a completely different protocol and a different setup. There are two ways to use them.

1. Use App and Adapter at the same time:
  If you want to keep using the app, you have to put the device into factory mode, following this procedure:
  1. Reset device into recovery mode by holding the wps/reset button during boot until it starts blinking **red** instead of orange.
  2. Now a telnet deamon is running, connect to the device wifi
  3. Run `telnet 192.168.0.20` and login with `admin:123456` (or use putty, don't forget to select `telnet` instead of `ssh`).
  4. Run `nvram_set FactoryMode 1`
  5. Run `reboot; exit;` to reboot the device.
  6. Now you should enter `TELNET` as Pin, and the adapter will retrieve the required data from the device itself.
2. Don't want to use the App
  1. Remove the device from the app, this will reset the device
  2. Start setup in the app again and configure your Wifi on the device.
  3. Now the device will reoobt and connect to your Wifi. During that time **close** the app, make sure it is really closed.
  4. Now the device should be connected to your Wifi and not connected to the app, so that the PIN from the sticker will work in the adapter.
  (If the device does not connect to your wifi or the device does not accept login via the PIN please try again. Press the button on the device until it lights up red in order to reset.
     
