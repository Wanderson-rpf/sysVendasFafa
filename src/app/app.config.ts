import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Hash location: no Electron as páginas são carregadas via file://, sem servidor para reescrever rotas.
    provideRouter(routes, withHashLocation()),
  ],
};
