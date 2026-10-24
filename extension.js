import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Main from 'resource:///org/gnome/shell/ui/main.js';

export default class TintedShellExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._settingsChangedIds = [
            this._settings.connect('changed::use-custom-accent-color', () => this._updateStylesheet()),
            this._settings.connect('changed::custom-accent-color', () => this._updateStylesheet()),
        ];
        this._updateStylesheet();
    }

    disable() {
        for (const id of this._settingsChangedIds)
            this._settings.disconnect(id);
        this._settingsChangedIds = null;
        this._settings = null;
        this._unloadCustomStylesheet();
    }

    _updateStylesheet() {
        this._unloadCustomStylesheet();

        if (!this._settings.get_boolean('use-custom-accent-color'))
            return;

        const color = this._settings.get_string('custom-accent-color');
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
            console.error(`Tint my Shell: invalid custom accent color: ${color}`);
            return;
        }

        const [success, contents] = this.get_file('stylesheet.css').load_contents(null);
        if (!success)
            throw new Error('Tint my Shell: could not read stylesheet.css');

        const stylesheet = new TextDecoder().decode(contents).replaceAll('-st-accent-color', color);
        const cacheDirectory = GLib.build_filenamev([GLib.get_user_cache_dir(), 'tinted-shell']);
        GLib.mkdir_with_parents(cacheDirectory, 0o755);

        this._customStylesheetPath = GLib.build_filenamev([cacheDirectory, 'custom-accent.css']);
        GLib.file_set_contents(this._customStylesheetPath, stylesheet);
        this._customStylesheet = Gio.File.new_for_path(this._customStylesheetPath);
        this._theme = Main.themeManager.getTheme();
        this._theme.load_stylesheet(this._customStylesheet);
    }

    _unloadCustomStylesheet() {
        if (!this._customStylesheet)
            return;

        this._theme.unload_stylesheet(this._customStylesheet);
        GLib.unlink(this._customStylesheetPath);
        this._customStylesheet = null;
        this._customStylesheetPath = null;
        this._theme = null;
    }
}
