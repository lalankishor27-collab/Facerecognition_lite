module.exports = {
  preset: '@react-native/jest-preset',
  // AsyncStorage is mocked via __mocks__/@react-native-async-storage/async-storage.js
  // No moduleNameMapper needed — Jest picks up __mocks__ automatically.
  setupFiles: ['./jest.setup.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/android/',
    '/ios/',
    // Default RN snapshot test — requires full native module setup, out of scope
    '__tests__/App.test.tsx',
  ],
};
