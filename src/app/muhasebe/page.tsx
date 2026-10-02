import React from 'react';
import { MuhasebeView } from './_components/MuhasebeView';

export const metadata = {
  title: 'Muhasebe | EFA Europe',
};

export default function MuhasebePage() {
  return (
    <div className="flex-1 bg-background text-foreground">
      <MuhasebeView />
    </div>
  );
}
