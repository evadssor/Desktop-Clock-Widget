# Clock Widget

A Windows desktop clock widget built with Electron. It syncs against NTP, supports multiple time zones, defaults to Eastern Time (`America/New_York`), and includes:

- Digital clock face by default
- Alternate face styles
- AM/PM and Military Time modes
- Always-on-top toggle
- Color, opacity, and font-size customization
- Optional seconds display

## Run

```powershell
npm install
npm start
```

## Notes

- The app keeps its settings in Electron's user data directory, so your preferences persist between launches.
- NTP sync uses `pool.ntp.org` and refreshes every 5 minutes.
- Closing the window hides it to the system tray; quit from the tray menu when you want to fully exit.
# Desktop-Clock-Widget
Windows desktop clock widget with NTP sync, timezone switching, digital clock face, and always-on-top mode.
