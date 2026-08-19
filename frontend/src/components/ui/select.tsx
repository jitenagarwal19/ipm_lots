"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Select — native <select> under a shadcn-shaped API.
 *
 * The previous implementation wrapped @base-ui/react Select. Its popup rendered
 * and the options were visible, but clicking an option never committed a value,
 * so Product / Company / Lab could not be chosen and no test could be created.
 *
 * Rather than debug the popup layer, this renders a real <select>. Trade-offs
 * taken deliberately:
 *
 *   + Selection always works — keyboard, mouse, touch, screen readers, mobile.
 *   + No portal, no z-index or focus-trap interaction with our dialogs.
 *   + Required/validation works natively inside a <form>.
 *   - Option rows can't carry arbitrary markup (a native <option> is text only),
 *     which we don't currently use anywhere.
 *
 * The exported API is unchanged, so no page needs editing:
 *
 *   <Select value={v} onValueChange={setV} required>
 *     <SelectTrigger className="...">
 *       <SelectValue placeholder="Select Product" />
 *     </SelectTrigger>
 *     <SelectContent>
 *       <SelectItem value="id">Label</SelectItem>
 *     </SelectContent>
 *   </Select>
 *
 * Trigger and Content are declarative markers: Root reads the placeholder off
 * SelectValue and the options off SelectItem, then renders one <select>.
 */

type SelectItemProps = {
  value: string
  children?: React.ReactNode
  className?: string
  disabled?: boolean
}

type SelectTriggerProps = React.HTMLAttributes<HTMLElement> & {
  size?: "sm" | "default"
  children?: React.ReactNode
}

type SelectValueProps = {
  placeholder?: string
  children?: React.ReactNode
  className?: string
}

type SelectContentProps = {
  children?: React.ReactNode
  className?: string
}

/** Marker components. Root reads their props; they never render themselves. */
function SelectTrigger(_props: SelectTriggerProps) {
  return null
}
function SelectValue(_props: SelectValueProps) {
  return null
}
function SelectContent(_props: SelectContentProps) {
  return null
}
function SelectItem(_props: SelectItemProps) {
  return null
}
function SelectGroup({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}
function SelectLabel({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}
function SelectSeparator() {
  return null
}
function SelectScrollUpButton() {
  return null
}
function SelectScrollDownButton() {
  return null
}

/**
 * Flatten arbitrarily nested children — `.map()` produces arrays and callers
 * often wrap groups in fragments, so a shallow walk would miss options.
 */
function flatten(children: React.ReactNode, out: React.ReactElement[] = []) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    if (child.type === React.Fragment) {
      flatten((child.props as { children?: React.ReactNode }).children, out)
      return
    }
    out.push(child)
    const nested = (child.props as { children?: React.ReactNode })?.children
    if (child.type === SelectGroup || child.type === SelectContent) {
      flatten(nested, out)
    }
  })
  return out
}

/** Native <option> can only hold text, so reduce label nodes to a string. */
function toText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(toText).join("")
  if (React.isValidElement(node)) {
    return toText((node.props as { children?: React.ReactNode }).children)
  }
  return ""
}

export type SelectProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  children?: React.ReactNode
  required?: boolean
  disabled?: boolean
  name?: string
  id?: string
}

function Select({
  value,
  defaultValue,
  onValueChange,
  children,
  required,
  disabled,
  name,
  id,
}: SelectProps) {
  const nodes = flatten(children)

  const trigger = nodes.find((n) => n.type === SelectTrigger)
  const triggerProps = (trigger?.props ?? {}) as SelectTriggerProps

  const valueNode = trigger
    ? flatten(triggerProps.children).find((n) => n.type === SelectValue)
    : undefined
  const placeholder = (valueNode?.props as SelectValueProps | undefined)?.placeholder

  const options = nodes
    .filter((n) => n.type === SelectItem)
    .map((n) => n.props as SelectItemProps)

  // A controlled <select> whose value matches no option renders blank, so keep
  // the placeholder selectable while nothing valid is chosen.
  const hasMatch = options.some((o) => o.value === value)
  const current = value === undefined ? undefined : hasMatch ? value : ""

  return (
    <select
      id={id}
      name={name}
      required={required}
      disabled={disabled}
      value={current}
      defaultValue={value === undefined ? defaultValue : undefined}
      onChange={(e) => onValueChange?.(e.target.value)}
      data-slot="select"
      className={cn(
        "flex h-10 w-full appearance-none rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100",
        "outline-none transition-colors focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        // Chevron drawn as a background image so the control stays a native select.
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2371717a%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>')]",
        "bg-[length:1rem_1rem] bg-[right_0.625rem_center] bg-no-repeat pr-9",
        triggerProps.className
      )}
    >
      {placeholder !== undefined && (
        <option value="" disabled={required}>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {toText(o.children)}
        </option>
      ))}
    </select>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
