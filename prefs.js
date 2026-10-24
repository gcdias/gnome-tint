import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TintedShellPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Accent color',
            description: 'Choose whether to use the system accent color or a custom color.',
        });
        const customColorRow = new Adw.SwitchRow({
            title: 'Use custom accent color',
        });
        const colorRow = new Adw.ActionRow({
            title: 'Custom color',
        });
        const colorDialog = new Gtk.ColorDialog({ with_alpha: false });
        const colorButton = new Gtk.ColorDialogButton({ dialog: colorDialog });
        const rgba = new Gdk.RGBA();

        rgba.parse(settings.get_string('custom-accent-color'));
        colorButton.set_rgba(rgba);
        colorButton.set_sensitive(settings.get_boolean('use-custom-accent-color'));

        settings.bind(
            'use-custom-accent-color',
            customColorRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'use-custom-accent-color',
            colorButton,
            'sensitive',
            Gio.SettingsBindFlags.DEFAULT
        );
        colorButton.connect('notify::rgba', () => {
            const selectedColor = colorButton.get_rgba();
            const hexColor = `#${[selectedColor.red, selectedColor.green, selectedColor.blue]
                .map(channel => Math.round(channel * 255).toString(16).padStart(2, '0'))
                .join('')}`;
            settings.set_string('custom-accent-color', hexColor);
        });

        colorRow.add_suffix(colorButton);
        colorRow.set_activatable_widget(colorButton);
        group.add(customColorRow);
        group.add(colorRow);
        page.add(group);
        window.add(page);
    }
}
