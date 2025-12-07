import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: {
				DEFAULT: '1rem',
				sm: '1.5rem',
				lg: '2rem',
				xl: '2.5rem',
				'2xl': '3rem',
			},
			screens: {
				sm: '640px',
				md: '768px',
				lg: '1024px',
				xl: '1280px',
				'2xl': '1536px',
			}
		},
		extend: {
			fontFamily: {
				sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'Roboto', 'system-ui', 'sans-serif'],
				display: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'system-ui', 'sans-serif'],
				mono: ['SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', 'Consolas', 'monospace'],
			},
			fontSize: {
				'caption': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.025em', fontWeight: '500' }],
				'body': ['0.875rem', { lineHeight: '1.5rem', fontWeight: '400' }],
				'body-large': ['1rem', { lineHeight: '1.5rem', fontWeight: '400' }],
				'headline': ['1.125rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em', fontWeight: '600' }],
				'title': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.02em', fontWeight: '700' }],
				'display': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.025em', fontWeight: '700' }],
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
					glow: 'hsl(var(--primary-glow))',
					deep: 'hsl(var(--primary-deep))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))',
					glow: 'hsl(var(--destructive-glow))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))',
					glow: 'hsl(var(--accent-glow))'
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))',
					glow: 'hsl(var(--success-glow))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))',
					glow: 'hsl(var(--warning-glow))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
				'3xl': '1.5rem',
				'4xl': '2rem',
				'5xl': '2.5rem'
			},
			spacing: {
				'18': '4.5rem',
				'88': '22rem',
				'128': '32rem',
			},
			backdropBlur: {
				'xs': '2px',
				'4xl': '72px'
			},
			boxShadow: {
				'xs': 'var(--shadow-sm)',
				'apple-sm': 'var(--shadow-card)',
				'apple-md': 'var(--shadow-floating)',
				'apple-lg': 'var(--shadow-glass)',
				'glass': 'var(--shadow-glass)',
				'floating': 'var(--shadow-floating)',
				'inner': 'var(--shadow-inner)'
			},
			backgroundImage: {
				'gradient-primary': 'var(--gradient-primary)',
				'gradient-surface': 'var(--gradient-surface)',
				'gradient-glass': 'var(--gradient-glass)',
				'gradient-card': 'var(--gradient-card)',
				'gradient-dynamic': 'var(--gradient-dynamic)'
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' }
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' }
				},
				'apple-entrance': {
					'0%': { 
						opacity: '0', 
						transform: 'translateY(16px) scale(0.96)'
					},
					'100%': { 
						opacity: '1', 
						transform: 'translateY(0) scale(1)'
					}
				},
				'apple-scale': {
					'0%': { transform: 'scale(0.95)' },
					'50%': { transform: 'scale(1.02)' },
					'100%': { transform: 'scale(1)' }
				},
				'apple-fade': {
					'0%': { opacity: '0' },
					'100%': { opacity: '1' }
				},
				'float': {
					'0%, 100%': { transform: 'translateY(0px)' },
					'50%': { transform: 'translateY(-4px)' }
				},
				'shimmer': {
					'0%': { left: '-100%' },
					'100%': { left: '100%' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'apple-entrance': 'apple-entrance 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
				'apple-scale': 'apple-scale 0.3s ease-out',
				'apple-fade': 'apple-fade 0.4s ease-out',
				'float': 'float 3s ease-in-out infinite',
				'shimmer': 'shimmer 3s infinite'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
