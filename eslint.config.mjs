// iobroker eslint configuration
import iobrokerEslintConfig from '@iobroker/eslint-config';

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
            '**/adapter-config.d.ts',
        ]
    }
];
