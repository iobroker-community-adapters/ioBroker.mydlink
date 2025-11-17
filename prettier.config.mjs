// iobroker prettier configuration file
import prettierConfig from '@iobroker/eslint-config/prettier.config.mjs';

export default {
    ...prettierConfig,
    // Adjust these to match your preferences:
    useTabs: false,        // or false for spaces
    singleQuote: false,   // or true for single quotes
};
