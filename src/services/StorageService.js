const SETTINGS_KEY = 'lucid_dream_settings_v1';

export const saveSettings = (settings) => {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
        // プライベートブラウズ等で保存できなくても、アプリの動作は継続する
        console.error('Failed to save settings:', e);
    }
};

export const getSettings = () => {
    try {
        const settings = localStorage.getItem(SETTINGS_KEY);
        return settings ? JSON.parse(settings) : null;
    } catch (e) {
        // 保存データが壊れていても初期化を止めず、既定値で起動する
        console.error('Failed to load settings (using defaults):', e);
        return null;
    }
};
