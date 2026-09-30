import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// Page tests render several MUI sections, each loading its own data. Under coverage
// instrumentation on a cold cache that can take close to the 1 s default for findBy*/waitFor.
configure({ asyncUtilTimeout: 3000 });
