module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: {
                module: 'commonjs',
                target: 'ES2020',
                esModuleInterop: true,
                moduleResolution: 'node',
                ignoreDeprecations: '6.0',
            },
        }],
    },
};
