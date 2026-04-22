import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BROWSER_TOOLS } from './browser.js';

// Mock Chrome API
const mockChrome = {
  tabs: {
    query: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    captureVisibleTab: vi.fn(),
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  debugger: {
    getTargets: vi.fn(),
    attach: vi.fn(),
    sendCommand: vi.fn(),
  },
  runtime: {
    lastError: null as any,
  },
};

global.chrome = mockChrome as any;

describe('Browser Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChrome.runtime.lastError = null;
  });

  describe('list_tabs', () => {
    it('should list all open tabs', async () => {
      const tool = BROWSER_TOOLS.find(t => t.name === 'list_tabs');
      const mockTabs = [
        { id: 1, title: 'Tab 1', url: 'https://example.com', active: true },
        { id: 2, title: 'Tab 2', url: 'https://google.com', active: false },
      ];
      mockChrome.tabs.query.mockResolvedValue(mockTabs);

      const result = await tool?.execute({});
      expect(mockChrome.tabs.query).toHaveBeenCalledWith({});
      expect(result).toEqual([
        { id: 1, title: 'Tab 1', url: 'https://example.com', active: true },
        { id: 2, title: 'Tab 2', url: 'https://google.com', active: false },
      ]);
    });
  });

  describe('navigate', () => {
    it('should navigate in active tab if new_tab is false', async () => {
      const tool = BROWSER_TOOLS.find(t => t.name === 'navigate');
      mockChrome.tabs.query.mockResolvedValue([{ id: 123 }]);
      mockChrome.tabs.update.mockResolvedValue({ id: 123 });
      
      // Mock onUpdated to trigger 'complete' status
      mockChrome.tabs.onUpdated.addListener.mockImplementation((listener) => {
        // Simulate immediate completion for the test
        setTimeout(() => listener(123, { status: 'complete' }), 0);
      });

      const result = await tool?.execute({ url: 'https://new-url.com', new_tab: false });
      
      expect(mockChrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
      expect(mockChrome.tabs.update).toHaveBeenCalledWith(123, { url: 'https://new-url.com' });
      expect(result).toEqual({ tabId: 123, url: 'https://new-url.com' });
    });

    it('should create new tab if new_tab is true', async () => {
      const tool = BROWSER_TOOLS.find(t => t.name === 'navigate');
      mockChrome.tabs.create.mockResolvedValue({ id: 456 });
      
      mockChrome.tabs.onUpdated.addListener.mockImplementation((listener) => {
        setTimeout(() => listener(456, { status: 'complete' }), 0);
      });

      const result = await tool?.execute({ url: 'https://example.com', new_tab: true });
      
      expect(mockChrome.tabs.create).toHaveBeenCalledWith({ url: 'https://example.com' });
      expect(result).toEqual({ tabId: 456, url: 'https://example.com' });
    });
  });

  describe('screenshot', () => {
    it('should capture visible tab', async () => {
      const tool = BROWSER_TOOLS.find(t => t.name === 'screenshot');
      mockChrome.tabs.captureVisibleTab.mockResolvedValue('data:image/png;base64,abc');

      const result = await tool?.execute({});
      expect(mockChrome.tabs.captureVisibleTab).toHaveBeenCalled();
      expect(result).toEqual({ image: 'data:image/png;base64,abc' });
    });
  });

  describe('get_content', () => {
    it('should extract innerText from active tab', async () => {
      const tool = BROWSER_TOOLS.find(t => t.name === 'get_content');
      mockChrome.tabs.query.mockResolvedValue([{ id: 1 }]);
      
      // Mock debugger workflow
      mockChrome.debugger.getTargets.mockImplementation((cb) => cb([{ tabId: 1, attached: true }]));
      mockChrome.debugger.sendCommand.mockImplementation((target, method, params, cb) => {
        if (method === 'Runtime.evaluate' && params.expression === 'document.body.innerText') {
          cb({ result: { value: 'Page content' } });
        }
      });

      const result = await tool?.execute({});
      expect(result).toEqual({ content: 'Page content' });
    });
  });

  describe('click', () => {
    it('should execute click script via debugger', async () => {
      const tool = BROWSER_TOOLS.find(t => t.name === 'click');
      mockChrome.tabs.query.mockResolvedValue([{ id: 1 }]);
      mockChrome.debugger.getTargets.mockImplementation((cb) => cb([{ tabId: 1, attached: true }]));
      mockChrome.debugger.sendCommand.mockImplementation((target, method, params, cb) => {
        cb({ result: { value: { success: true, selector: '#btn' } } });
      });

      const result = await tool?.execute({ selector: '#btn' });
      expect(result).toEqual({ success: true, selector: '#btn' });
    });
  });

  describe('type_text', () => {
    it('should execute typing script via debugger', async () => {
      const tool = BROWSER_TOOLS.find(t => t.name === 'type_text');
      mockChrome.tabs.query.mockResolvedValue([{ id: 1 }]);
      mockChrome.debugger.getTargets.mockImplementation((cb) => cb([{ tabId: 1, attached: true }]));
      mockChrome.debugger.sendCommand.mockImplementation((target, method, params, cb) => {
        cb({ result: { value: { success: true } } });
      });

      const result = await tool?.execute({ selector: 'input', text: 'hello' });
      expect(result).toEqual({ success: true });
    });
  });

  describe('scroll', () => {
    it('should execute scroll script via debugger', async () => {
      const tool = BROWSER_TOOLS.find(t => t.name === 'scroll');
      mockChrome.tabs.query.mockResolvedValue([{ id: 1 }]);
      mockChrome.debugger.getTargets.mockImplementation((cb) => cb([{ tabId: 1, attached: true }]));
      mockChrome.debugger.sendCommand.mockImplementation((target, method, params, cb) => {
        cb({ result: { value: { success: true } } });
      });

      const result = await tool?.execute({ direction: 'down', amount: 100 });
      expect(result).toEqual({ success: true });
    });
  });

  describe('wait_for_element', () => {
    it('should return found: true if element appears', async () => {
      const tool = BROWSER_TOOLS.find(t => t.name === 'wait_for_element');
      mockChrome.tabs.query.mockResolvedValue([{ id: 1 }]);
      mockChrome.debugger.getTargets.mockImplementation((cb) => cb([{ tabId: 1, attached: true }]));
      mockChrome.debugger.sendCommand.mockImplementation((target, method, params, cb) => {
        cb({ result: { value: { found: true } } });
      });

      const result = await tool?.execute({ selector: '.late-element' });
      expect(result).toEqual({ found: true });
    });
  });

  describe('get_page_info', () => {
    it('should return active tab title and url', async () => {
      const tool = BROWSER_TOOLS.find(t => t.name === 'get_page_info');
      mockChrome.tabs.query.mockResolvedValue([{ id: 1, title: 'Title', url: 'https://test.com' }]);

      const result = await tool?.execute({});
      expect(result).toEqual({ title: 'Title', url: 'https://test.com', tabId: 1 });
    });
  });
});
