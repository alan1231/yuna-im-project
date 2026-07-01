import React from 'react';
import { useSessionViewModel } from './src/viewmodels/session/useSessionViewModel';
import { AppView } from './src/views/AppView';

export default function App() {
  const session = useSessionViewModel();

  return (
    <AppView
      currentUser={session.currentUser}
      isRestoringUser={session.isRestoringUser}
      onAuthenticated={session.persistCurrentUser}
      onLogout={session.logout}
    />
  );
}
