import { AppProvider } from './app/providers/app-provider';
import { AppRouterProvider } from './app/router';

function App() {
  return (
    <AppProvider>
      <AppRouterProvider />
    </AppProvider>
  );
}

export default App;
