import type { Config } from "tailwindcss";

export default {
    darkMode: ["class"],
    content: ["./pages/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}", "./app/**/*.{js,ts,jsx,tsx,mdx}", "*.{js,ts,jsx,tsx,mdx}"],
  theme: {
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		typography: {
  			DEFAULT: {
  				css: {
  					maxWidth: '65ch',
  					color: 'hsl(var(--foreground))',
  					h1: {
  						color: 'hsl(var(--foreground))'
  					},
  					h2: {
  						color: 'hsl(var(--foreground))'
  					},
  					h3: {
  						color: 'hsl(var(--foreground))'
  					},
  					h4: {
  						color: 'hsl(var(--foreground))'
  					},
  					blockquote: {
  						borderLeftColor: 'hsl(var(--primary))',
  						backgroundColor: 'hsl(var(--secondary))',
  						color: 'hsl(var(--muted-foreground))',
  						borderRadius: '0.5rem',
  						padding: '1em 1.5em',
  						margin: '2em 0'
  					},
  					'blockquote p:first-of-type::before': {
  						content: 'none'
  					},
  					'blockquote p:last-of-type::after': {
  						content: 'none'
  					},
  					code: {
  						backgroundColor: 'hsl(var(--secondary))',
  						color: 'hsl(var(--foreground))',
  						borderRadius: '0.25rem',
  						padding: '0.2em 0.4em',
  						fontSize: '0.875em'
  					},
  					'a:hover': {
  						color: 'hsl(var(--primary))'
  					},
  					pre: {
  						backgroundColor: 'hsl(var(--secondary))'
  					},
  					img: {
  						borderRadius: '0.75rem'
  					},
  					figcaption: {
  						color: 'hsl(var(--muted-foreground))',
  						fontSize: '0.875rem',
  						lineHeight: '1.5',
  						marginTop: '0.75em'
  					}
  				}
  			}
  		}
  	}
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography")
  ],
} satisfies Config;
