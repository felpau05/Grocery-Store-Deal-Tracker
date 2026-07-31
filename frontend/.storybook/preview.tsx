import type { Preview } from '@storybook/nextjs-vite'
import React from 'react'
import '../src/app/globals.css'
import { CartProvider } from '@/lib/cart'
import { ToastProvider } from '@/lib/toast'
import { AccountProvider } from '@/lib/account'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    },

    // This app only uses the App Router (src/app/), so next/navigation's
    // useRouter etc. need AppRouterContext, not the Pages Router context.
    nextjs: {
      appDirectory: true,
    },
  },

  decorators: [
    (Story) => (
      <ToastProvider>
        <AccountProvider>
          <CartProvider>
            <Story />
          </CartProvider>
        </AccountProvider>
      </ToastProvider>
    ),
  ],
};

export default preview;
