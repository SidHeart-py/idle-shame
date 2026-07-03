import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const COFFEE_URL = 'upi://pay?pa=sidthebot@ybl&pn=Siddharth&tn=Buy%20me%20a%20coffee'; // TODO: swap in your real link
const REPO_URL = 'https://github.com/SidHeart-py/idle-shame';

export default class IdleShamePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // ---------------------------------------------------
        // General page — idle threshold
        // ---------------------------------------------------
        const generalPage = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(generalPage);

        const timingGroup = new Adw.PreferencesGroup({
            title: _('Idle Detection'),
            description: _('Choose how long the screen must sit idle before Idle Shame shows the overlay.'),
        });
        generalPage.add(timingGroup);

        const idleRow = new Adw.SpinRow({
            title: _('Idle threshold'),
            subtitle: _('Seconds of inactivity before the timer starts'),
            adjustment: new Gtk.Adjustment({
                lower: 5,
                upper: 3600,
                step_increment: 5,
                page_increment: 30,
            }),
        });
        timingGroup.add(idleRow);

        // Two-way bind: prefs UI <-> gsettings <-> extension.js
        settings.bind(
            'idle-seconds',
            idleRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        // ---------------------------------------------------
        // Support page — buy me a coffee / repo link
        // ---------------------------------------------------
        const supportPage = new Adw.PreferencesPage({
            title: _('Support'),
            icon_name: 'emblem-favorite-symbolic',
        });
        window.add(supportPage);

        const supportGroup = new Adw.PreferencesGroup({
            title: _('Enjoying Idle Shame?'),
            description: _('If this extension has been useful — or has successfully guilted you off the screen a few times — consider buying me a coffee.'),
        });
        supportPage.add(supportGroup);

        const coffeeRow = new Adw.ActionRow({
            title: _('☕ Buy me a coffee'),
            subtitle: COFFEE_URL,
        });
        coffeeRow.add_suffix(new Gtk.LinkButton({
            uri: COFFEE_URL,
            label: _('Open'),
            valign: Gtk.Align.CENTER,
        }));
        supportGroup.add(coffeeRow);

        const repoRow = new Adw.ActionRow({
            title: _('View source on GitHub'),
            subtitle: REPO_URL,
        });
        repoRow.add_suffix(new Gtk.LinkButton({
            uri: REPO_URL,
            label: _('Open'),
            valign: Gtk.Align.CENTER,
        }));
        supportGroup.add(repoRow);
    }
}
