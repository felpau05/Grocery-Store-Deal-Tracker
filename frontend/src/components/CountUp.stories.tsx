import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import CountUp from "./CountUp";

const meta = {
  title: "Components/CountUp",
  component: CountUp,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="font-mono text-3xl font-bold text-ink">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CountUp>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { value: 42 },
};

export const Currency: Story = {
  args: { value: 128.47, decimals: 2, prefix: "$" },
};

export const SlowCount: Story = {
  args: { value: 1000, durationMs: 2500 },
};
