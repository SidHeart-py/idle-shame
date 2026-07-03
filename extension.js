import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

let overlay = null;
let label = null;
let timerId = null;
let checkId = null;
let activeWatchId = null;
let startTime = 0;
let settings = null;   // GSettings, set in enable()

const INHIBIT_IDLE_FLAG = 8;   // org.gnome.SessionManager inhibitor flag
const DEFAULT_IDLE_SECONDS = 90;


// -----------------------------------
// Idle limit (now user-configurable)
// -----------------------------------

function getIdleLimitMs() {
    const seconds = settings
        ? settings.get_int('idle-seconds')
        : DEFAULT_IDLE_SECONDS;
    return seconds * 1000;
}


// -----------------------------------
// Idle Monitor
// -----------------------------------

function getIdleMonitor() {
    return global.backend.get_core_idle_monitor();
}

function getIdleTime() {
    try {
        return getIdleMonitor().get_idletime();
    } catch (e) {
        return 0;
    }
}


// -----------------------------------
// Session Inhibitor Check
// Returns true if any app (YouTube, VLC, etc.)
// has registered an INHIBIT_IDLE inhibitor.
// This is async — calls back with the result.
// -----------------------------------

function checkIdleInhibited(callback) {
    try {
        // Step 1: connect to SessionManager
        const sessionManager = Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SESSION,
            Gio.DBusProxyFlags.NONE,
            null,
            'org.gnome.SessionManager',
            '/org/gnome/SessionManager',
            'org.gnome.SessionManager',
            null
        );

        // Step 2: get list of inhibitor object paths
        const inhibitorsVariant = sessionManager.call_sync(
            'GetInhibitors',
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null
        );

        // GetInhibitors returns (ao) — array of object paths
        const inhibitorPaths = inhibitorsVariant.get_child_value(0).deepUnpack();

        if (inhibitorPaths.length === 0) {
            callback(false);
            return;
        }

        // Step 3: check each inhibitor's flags
        let inhibited = false;

        for (const path of inhibitorPaths) {
            try {
                const inhibitor = Gio.DBusProxy.new_for_bus_sync(
                    Gio.BusType.SESSION,
                    Gio.DBusProxyFlags.NONE,
                    null,
                    'org.gnome.SessionManager',
                    path,
                    'org.gnome.SessionManager.Inhibitor',
                    null
                );

                const flagsVariant = inhibitor.call_sync(
                    'GetFlags',
                    null,
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null
                );

                const flags = flagsVariant.get_child_value(0).get_uint32();

                if (flags & INHIBIT_IDLE_FLAG) {
                    inhibited = true;
                    break;
                }
            } catch (e) {
                // Individual inhibitor proxy failed — skip it
            }
        }

        callback(inhibited);

    } catch (e) {
        // DBus call failed — assume not inhibited so we don't break normal behavior
        callback(false);
    }
}


// -----------------------------------
// Inhibitor check (locked screen)
// -----------------------------------

function isSessionLocked() {
    return Main.sessionMode.isLocked;
}


// -----------------------------------
// Create Overlay
// -----------------------------------

function createOverlay() {
    const monitor = Main.layoutManager.primaryMonitor;

    overlay = new St.Bin({
        style: 'background-color: black;',
        reactive: false,
        x: monitor.x,
        y: monitor.y,
        width: monitor.width,
        height: monitor.height,
    });

    label = new St.Label({
        text: '00:00',
        style: 'color: white; font-size: 140px; font-weight: bold;',
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });

    overlay.set_child(label);
    Main.layoutManager.addChrome(overlay);
}


// -----------------------------------
// Destroy Overlay
// -----------------------------------

function destroyOverlay() {
    if (activeWatchId !== null) {
        try {
            getIdleMonitor().remove_watch(activeWatchId);
        } catch (e) {}
        activeWatchId = null;
    }

    if (timerId !== null) {
        GLib.source_remove(timerId);
        timerId = null;
    }

    if (overlay !== null) {
        Main.layoutManager.removeChrome(overlay);
        overlay.destroy();
        overlay = null;
    }

    label = null;
}


// -----------------------------------
// Format seconds → MM:SS
// -----------------------------------

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}


// -----------------------------------
// Start Timer + Activity Watch
// -----------------------------------

function startTimer() {
    startTime = Date.now();

    if (label)
        label.set_text(formatTime(0));

    try {
        activeWatchId = getIdleMonitor().add_user_active_watch((_monitor) => {
            activeWatchId = null;
            destroyOverlay();
        });
    } catch (e) {
        activeWatchId = null;
    }

    timerId = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT,
        1,
        () => {
            if (overlay === null || label === null) {
                timerId = null;
                return GLib.SOURCE_REMOVE;
            }

            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            label.set_text(formatTime(elapsed));

            return GLib.SOURCE_CONTINUE;
        }
    );
}


// -----------------------------------
// Periodic Check
// Reads the user's configured idle-seconds on every tick,
// so changes made in prefs take effect without re-enabling.
// -----------------------------------

function periodicCheck() {
    if (overlay !== null)
        return GLib.SOURCE_CONTINUE;

    if (isSessionLocked())
        return GLib.SOURCE_CONTINUE;

    const idle = getIdleTime();

    if (idle < getIdleLimitMs())
        return GLib.SOURCE_CONTINUE;

    // idle threshold reached — now check inhibitors before showing
    checkIdleInhibited((inhibited) => {
        // Guard again inside callback: state may have changed
        // during the async DBus round-trip
        if (inhibited) {
            // YouTube/VLC/etc is running — stay quiet
            return;
        }

        if (overlay !== null)
            return;

        if (isSessionLocked())
            return;

        createOverlay();
        startTimer();
    });

    return GLib.SOURCE_CONTINUE;
}


// -----------------------------------
// Extension entry point
// -----------------------------------

export default class IdleShameExtension extends Extension {

    enable() {
        settings = this.getSettings();

        checkId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            5,
            periodicCheck
        );
    }

    disable() {
        if (checkId !== null) {
            GLib.source_remove(checkId);
            checkId = null;
        }

        destroyOverlay();
        settings = null;
    }
}
