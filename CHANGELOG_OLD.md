# Older changes
## 1.3.2 (2023-06-23)
* better handle possible exception on unload.

## 1.3.1 (2023-06-12)
* fix minor errors
* improved siren support.

## 1.3.0 (2023-05-15)
* reworked code to type-script (please report errors / things that work worse than before)
* added: reboot button for SOAP devices (seems they tend to die now the servers are gone)
* added: support for siren devices
* added: device connection status displayed in admin.
* removed: info.connection state.

## 1.2.1 (2022-09-01)
* fix release...

## 1.2.0 (2022-08-30)
* Update translations & dependencies
* Add support for devices with multiple sockets
* Allow polling for websocket devices

## 1.1.12 (2021-07-21)
* Update translations

## 1.1.11 (2021-06-30)
* adjusted types & roles to type-detector.

## 1.1.10 (2021-06-30)
* fix type warnings
* updated translations and dependencies

## 1.1.9 (2021-05-23)
* updated translations

## 1.1.8 (2021-05-20)
* added: `telnet` token is now case insensitive
* fixed: prevent object missing warning on new devices

## 1.1.7 (2020-10-09)
* fixed: prevent error message with new mydlink plugs on switch

## 1.1.6 (2020-10-09)
* fixed: prevent error message with new mydlink plugs on switch (broken)

## 1.1.5 (2020-09-03)
* Add: support for DCH-S160 water detector added (needs polling, linke motion detector).

## 1.1.4 (2020-06-23)
* fixed: sometimes state was always reported as true.

## 1.1.3 (2020-06-18)
* fixed: if error during login, polling would stop.
* fixed: can now update device name from config again
* change: read devices from config in UI again
* change: in UI do not create +-Button if detected device is already in devices table.

## 1.1.2 (2020-06-01)
* fixed two possible crashes with offline / wrong devices.

## 1.1.1 (2020-06-01)
* Improved auto detection of DSP-W115 (but mdns seems very unreliable whit that device)
* UI should never delete user devices

## 1.1.0 (2020-05-31)
* Added Support for w115 (and maybe other never myDlink devices, might even do *something* with cameras)
* Fix relogin to device (i.e. when device was restarted during adapter runtime) 
* Fix error when switching a socket.

## 1.0.11 (2020-05-10)
* Tried to add even more information in case device seems incompatible

## 1.0.10 (2020-05-10)
* Returned to login with user "Admin"
* Tried to add more debug for incompatible devices.

## 1.0.9 (2020-05-07)
* Fixed: changes in configuration were not respected once devices were created
* Fixed: re-login to device on switching if polling is disabled
* Fixed: Error output on switching now more informative

## 1.0.8 (2020-05-05)
* Fixed switching, was broken in some circumstances by id changes.

## 1.0.7 (2020-05-02)
* Made saving config more robust and direct again.
* Made identify by IP more robust and allows saving right away. 
* Prevent saving if devices without PIN are configured.

## 1.0.6 (2020-05-02)
* Prevent creation of empty devices (MYDLINK-6)

## 1.0.5 (2020-05-02)
* Fixed possible issue with device ids.
* Improved device creation
* Adjusted for discovery adapter that not yet stores passwords encrypted.

## 1.0.4 (2020-05-01)
* Improved connection keepAlive
* Improved logging of network errors

## 1.0.3 (2020-05-01)
* Fixed login/identification loop on (possibly) duplicate devices

## 1.0.2 (2020-04-30)
* Fixed potential crashes on network errors.

## 1.0.1 (2020-04-30)
* Re-added device config to adapter config (in case objects get deleted).

## 1.0.0 (2020-04-30)
* BREAKING CHANGE: device id is now mac instead of name -> all devices need to be recreated. Sorry for that. But should never happen again, now. New devices *should* be created automatically.
* added encryption of PIN
* settings stored in native part of device (please do not delete them or you have to reconfigure them)
* modified device creation / identification / start to allow devices to be (re-)started during runtime (you do not need to press save on config page anymore)
* added auto detection
* added missing translations
* added sentry plugin (including sending information about unknown devices)
* a lot of internal restructuring and cleanup for better maintenance in future.

## 0.0.7
* (Garfonso) added info.connection state
* (Garfonso) suppressed repeated error messages during polling.

## 0.0.6
* (Garfonso) prevent removement of custom details in objects.

## 0.0.5
* (Garfonso) fixed config files for release in latest repository.

## 0.0.4
* (Garfonso) polling interval can now be configured on per device basis (if not configured for a device global poll intervall will be used.) Recommendation: Use high global poll interval and a smaller one for motion detectors.
* (Garfonso) added no_motion state for motion detectors, contains number of seconds since last motion.

## 0.0.3
* (Garfonso) use setStateChanged instead of polling state before writing.
* (Garfonso) minor clean ups.

## 0.0.2
* (Garfonso) move to ioborker-community-adapters

## 0.0.1
* (Garfonso) initial release
