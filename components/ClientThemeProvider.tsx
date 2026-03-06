"use client";

import { ThemeProvider, ThemeProviderProps } from 'next-themes';
import { ReactNode, useEffect, useState } from 'react';

export default function ClientThemeProvider({ children, ...props }: ThemeProviderProps & { children: ReactNode }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    return (
        mounted &&
        <ThemeProvider {...props}> 
        
            {children}
        
        </ThemeProvider>
        
    );
}