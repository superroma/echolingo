'use client';

import { useEffect, useState } from 'react';
import { EchoClient } from '../../../components/echo-client';

function readIdFromPath(): string {
  if (typeof window === 'undefined') return '';
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[1] ?? '';
}

export function EchoByIdClient() {
  const [id, setId] = useState('');
  useEffect(() => {
    setId(readIdFromPath());
  }, []);
  if (!id) return null;
  return <EchoClient kind="existing" id={id} />;
}
