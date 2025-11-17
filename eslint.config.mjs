// iobroker eslint configuration
import iobrokerEslintConfig from '@iobroker/eslint-config/eslint.config.mjs';

export default [
    ...iobrokerEslintConfig,
    {
        ignores: [
            '.dev-server/',
            '.vscode/',
            '*.test.js',
            'test/**/*.js',
            '*.config.mjs',
            'build',
            'dist',
            'admin/build/',
            'admin/words.js',
            'admin/admin.d.ts',
            '**/adapter-config.d.ts',
        ]
    }
];
