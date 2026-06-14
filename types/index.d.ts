/// <reference types="node" />
import type {ChildProcess} from 'node:child_process';

export interface Viewport {
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

export interface LaunchOptions {
  /** Run with no visible window. Default: true. */
  headless?: boolean;
  /** Path to the Chrome binary. Auto-detected if omitted. */
  executablePath?: string;
  /** Extra command-line flags for Chrome. */
  args?: string[];
  /** Pipe Chrome's stdout/stderr to the console. Default: false. */
  dumpio?: boolean;
  /** Initial viewport size. */
  defaultViewport?: Viewport;
}

export interface NavigationOptions {
  timeout?: number;
  waitUntil?: 'load' | 'domcontentloaded';
}

export type GotoOptions = NavigationOptions;

export interface WaitForSelectorOptions {
  timeout?: number;
  visible?: boolean;
}

export interface ClickOptions {
  timeout?: number;
}

export interface TypeOptions {
  timeout?: number;
  /** Delay between keystrokes in ms. */
  delay?: number;
}

export interface ScreenshotOptions {
  path?: string;
  type?: 'png' | 'jpeg' | 'webp';
  fullPage?: boolean;
}

export interface PdfOptions {
  path?: string;
  printBackground?: boolean;
  landscape?: boolean;
}

export interface HistoryEntry {
  id: number;
  url: string;
  title: string;
}

export class Page {
  goto(url: string, options?: GotoOptions): Promise<void>;
  waitForNavigation(options?: NavigationOptions): Promise<unknown>;
  goBack(options?: NavigationOptions): Promise<HistoryEntry | null>;
  goForward(options?: NavigationOptions): Promise<HistoryEntry | null>;
  evaluate<T = unknown, A extends unknown[] = unknown[]>(
    fn: ((...args: A) => T) | string,
    ...args: A
  ): Promise<T>;
  title(): Promise<string>;
  content(): Promise<string>;
  url(): Promise<string>;
  waitForSelector(
    selector: string,
    options?: WaitForSelectorOptions,
  ): Promise<void>;
  click(selector: string, options?: ClickOptions): Promise<void>;
  hover(selector: string, options?: ClickOptions): Promise<void>;
  type(selector: string, text: string, options?: TypeOptions): Promise<void>;
  select(selector: string, ...values: string[]): Promise<string[]>;
  screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  pdf(options?: PdfOptions): Promise<Buffer>;
  setViewport(viewport: Viewport): Promise<void>;
  close(): Promise<void>;
}

export class Browser {
  newPage(): Promise<Page>;
  process(): ChildProcess | undefined;
  close(): Promise<void>;
}

export class CDPSession {
  send(method: string, params?: Record<string, unknown>): Promise<any>;
  readonly id: string;
}

export class Connection {
  static create(browserWSEndpoint: string): Promise<Connection>;
  send(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<any>;
  session(sessionId: string): CDPSession;
  close(): void;
}

export function launch(options?: LaunchOptions): Promise<Browser>;

declare const _default: {launch: typeof launch};
export default _default;
