import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';
const BACKGROUND_SCHEMA = 'org.gnome.desktop.background';
const ACCENT_COLOR_KEY = 'accent-color';
const PICTURE_URI_KEY = 'picture-uri';
const PICTURE_URI_DARK_KEY = 'picture-uri-dark';

class HueRange {
    constructor(lowerBound, upperBound) {
        this.lowerBound = lowerBound;
        this.upperBound = upperBound;
    }
}

class AccentColour {
    constructor(name, r, g, b, hueRange) {
        this.name = name;
        this.r = r;
        this.g = g;
        this.b = b;
        this.hueRange = hueRange;
    }
}

const ACCENT_COLOURS = [
    new AccentColour('blue', 0, 115, 255, new HueRange(195, 300)),
    new AccentColour('teal', 0, 255, 255, new HueRange(120, 240)),
    new AccentColour('green', 0, 191, 0, new HueRange(50, 180)),
    new AccentColour('yellow', 200, 150, 0, new HueRange(29, 64)),
    new AccentColour('orange', 237, 91, 0, new HueRange(9, 64)),
    new AccentColour('red', 230, 0, 26, new HueRange(340, 9)),
    new AccentColour('pink', 230, 138, 182, new HueRange(240, 8)),
    new AccentColour('purple', 145, 65, 172, new HueRange(240, 330)),
    new AccentColour('slate', 166, 166, 166, new HueRange(195, 300)),
];

function getHueFromRGB(r, g, b) {
    const maxColour = Math.max(r, g, b);
    const minColour = Math.min(r, g, b);
    const delta = maxColour - minColour;

    let hue = 0;
    if (delta === 0)
        return hue;

    switch (maxColour) {
        case r:
            hue = (g - b) / delta;
            break;
        case g:
            hue = 2 + (b - r) / delta;
            break;
        case b:
            hue = 4 + (r - g) / delta;
            break;
    }

    hue *= 60;
    if (hue < 0)
        hue += 360;

    return hue;
}

function getSaturationFromRGB(r, g, b) {
    const maxColourPercentage = Math.max(r, g, b) / 255;
    const minColourPercentage = Math.min(r, g, b) / 255;
    const delta = maxColourPercentage - minColourPercentage;

    let saturation = 0.0;
    if (maxColourPercentage !== 0.0)
        saturation = delta / maxColourPercentage;

    return saturation * 100;
}

function getSquaredEuclideanDistance(r1, g1, b1, r2, g2, b2) {
    return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
}

function isHueInRange(hue, hueRange) {
    if (hue >= hueRange.lowerBound && hue <= hueRange.upperBound)
        return true;

    if (hueRange.lowerBound > hueRange.upperBound)
        return hue >= hueRange.lowerBound || hue <= hueRange.upperBound;

    return false;
}

function getClosestAccentColour(accentColours, r, g, b) {
    const hue = getHueFromRGB(r, g, b);
    const eligibleAccents = accentColours.filter(accent => isHueInRange(hue, accent.hueRange));
    const saturation = getSaturationFromRGB(r, g, b);

    if (saturation < 5)
        return ACCENT_COLOURS[ACCENT_COLOURS.length - 1];

    let shortestDistance = Number.MAX_VALUE;
    let closestAccent = ACCENT_COLOURS[ACCENT_COLOURS.length - 1];

    const candidateAccents = eligibleAccents.length > 0 ? eligibleAccents : accentColours;
    for (const accent of candidateAccents) {
        const distance = getSquaredEuclideanDistance(
            r, g, b,
            accent.r, accent.g, accent.b,
        );

        if (distance < shortestDistance) {
            shortestDistance = distance;
            closestAccent = accent;
        }
    }

    return closestAccent;
}

function rgbToHex(r, g, b) {
    return `#${[r, g, b].map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function execCommand(argv, input = null, cancellable = null) {
    let flags = Gio.SubprocessFlags.STDOUT_PIPE;
    if (input !== null)
        flags |= Gio.SubprocessFlags.STDIN_PIPE;

    const process = new Gio.Subprocess({ argv, flags });
    process.init(cancellable);

    return new Promise((resolve, reject) => {
        process.communicate_utf8_async(input, cancellable, (_proc, res) => {
            try {
                resolve(_proc.communicate_utf8_finish(res)[1]);
            } catch (error) {
                reject(error);
            }
        });
    });
}

async function runColorThief(imagePath, extensionPath) {
    try {
        const resultStr = await execCommand([
            'gjs',
            '-m',
            `${extensionPath}/color-thief/run-color-thief.js`,
            imagePath,
        ]);

        const palette = resultStr.split(';').map(entry => entry.split(',').map(Number));
        return palette;
    } catch (_error) {
        return Array(5).fill([0, 0, 0]);
    }
}

async function getBackgroundPalette(extensionPath, backgroundPath) {
    const palette = await runColorThief(backgroundPath, extensionPath);
    if (!palette || palette.length < 2)
        return [[0, 0, 0], [0, 0, 0]];

    return [palette[0], palette[1]];
}

export default class GnomeThemeColorExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._backgroundSettings = new Gio.Settings({ schema: BACKGROUND_SCHEMA });
        this._interfaceSettings = new Gio.Settings({ schema: INTERFACE_SCHEMA });
        this._theme = St.ThemeContext.get_for_stage(global.stage).get_theme();

        this._updateStylesheet = () => this._updateAccentFromBackground();

        this._backgroundSignalIds = [
            this._backgroundSettings.connect('changed::picture-uri', this._updateStylesheet),
            this._backgroundSettings.connect('changed::picture-uri-dark', this._updateStylesheet),
        ];
        this._interfaceSignalIds = [
            this._interfaceSettings.connect('changed::color-scheme', this._updateStylesheet),
            this._settings.connect('changed::enabled', this._updateStylesheet),
            this._settings.connect('changed::highlight-mode', this._updateStylesheet),
        ];

        this._updateAccentFromBackground();
    }

    disable() {
        for (const id of this._backgroundSignalIds)
            this._backgroundSettings?.disconnect(id);
        for (const id of this._interfaceSignalIds)
            this._interfaceSettings?.disconnect(id);

        this._unloadStylesheet();
        this._backgroundSignalIds = [];
        this._interfaceSignalIds = [];
        this._backgroundSettings = null;
        this._interfaceSettings = null;
        this._settings = null;
        this._theme = null;
    }

    _getBackgroundUri() {
        const colorScheme = this._interfaceSettings.get_string('color-scheme');

        if (colorScheme === 'prefer-dark') {
            const darkUri = this._backgroundSettings.get_string(PICTURE_URI_DARK_KEY);
            if (darkUri)
                return darkUri;
        }

        return this._backgroundSettings.get_string(PICTURE_URI_KEY);
    }

    async _updateAccentFromBackground() {
        this._unloadStylesheet();

        if (!this._settings || !this._settings.get_boolean('enabled'))
            return;

        const backgroundUri = this._getBackgroundUri();
        if (!backgroundUri)
            return;

        const backgroundFile = Gio.File.new_for_uri(backgroundUri);
        const backgroundPath = backgroundFile.get_path();
        if (!backgroundPath)
            return;

        try {
            const [dominant, highlight] = await getBackgroundPalette(this.path, backgroundPath);
            const palette = this._settings.get_boolean('highlight-mode') ? highlight : dominant;
            const accent = getClosestAccentColour(ACCENT_COLOURS, palette[0], palette[1], palette[2]);
            const accentHex = rgbToHex(accent.r, accent.g, accent.b);

            this._interfaceSettings.set_string(ACCENT_COLOR_KEY, accent.name);
            this._applyStylesheet(accentHex);
        } catch (_error) {
            this._applyStylesheet('#3584e4');
        }
    }

    _applyStylesheet(accentHex) {
        const stylesheetPath = GLib.build_filenamev([this.path, 'stylesheet.css']);
        const [success, contents] = Gio.File.new_for_path(stylesheetPath).load_contents(null);
        if (!success)
            throw new Error('Gnome Theme Color: could not read stylesheet.css');

        const stylesheet = new TextDecoder().decode(contents).replaceAll('-st-accent-color', accentHex);
        const cacheDirectory = GLib.build_filenamev([GLib.get_user_cache_dir(), 'gnome-theme-color']);
        GLib.mkdir_with_parents(cacheDirectory, 0o755);

        this._customStylesheetPath = GLib.build_filenamev([cacheDirectory, 'theme-color.css']);
        GLib.file_set_contents(this._customStylesheetPath, stylesheet);

        this._customStylesheet = Gio.File.new_for_path(this._customStylesheetPath);
        this._theme.load_stylesheet(this._customStylesheet);
    }

    _unloadStylesheet() {
        if (!this._customStylesheet)
            return;

        this._theme.unload_stylesheet(this._customStylesheet);
        if (this._customStylesheetPath)
            GLib.unlink(this._customStylesheetPath);

        this._customStylesheet = null;
        this._customStylesheetPath = null;
    }
}
