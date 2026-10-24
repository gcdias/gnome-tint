EXTENSION_UUID = gnome-tint@gcdias
INSTALL_PATH = ~/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)
FILES = extension.js metadata.json stylesheet.css prefs.js
SCHEMA = schemas/org.gnome.shell.extensions.gnome-tint.gschema.xml

install:
	rm -rf $(INSTALL_PATH)
	mkdir -p $(INSTALL_PATH)/schemas
	cp $(FILES) $(INSTALL_PATH)
	cp $(SCHEMA) $(INSTALL_PATH)/schemas
	glib-compile-schemas $(INSTALL_PATH)/schemas
	@echo "Installed 'Gnome Tint' to $(INSTALL_PATH)"
	@echo "Please restart GNOME Shell (logout/login) to apply changes."

zip:
	@build_dir=$$(mktemp -d); \
	trap 'rm -rf "$$build_dir"' EXIT; \
	mkdir -p "$$build_dir/schemas"; \
	cp extension.js metadata.json stylesheet.css prefs.js "$$build_dir"; \
	cp $(SCHEMA) "$$build_dir/schemas"; \
	glib-compile-schemas "$$build_dir/schemas"; \
	cd "$$build_dir" && zip -r -FS "$(CURDIR)/gnome-tint.zip" extension.js metadata.json stylesheet.css prefs.js schemas

uninstall:
	rm -rf $(INSTALL_PATH)
