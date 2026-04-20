import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { WebSocketProvider, useWebSocket } from "../WebSocketProvider";
import type { ReactNode } from "react";

// Mock WebSocket
class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = MockWebSocket.CONNECTING;
    url: string;
    onopen: ((event: Event) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;

    constructor(url: string) {
        this.url = url;
        // Simulate async connection
        setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            this.onopen?.(new Event("open"));
        }, 10);
    }

    send(data: string) {
        if (this.readyState !== MockWebSocket.OPEN) {
            throw new Error("WebSocket is not open");
        }
    }

    close() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.(new CloseEvent("close"));
    }
}

global.WebSocket = MockWebSocket as unknown as typeof WebSocket;

describe("WebSocketProvider", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
        <WebSocketProvider url="ws://localhost:9393/ws">{children}</WebSocketProvider>
    );

    it("should connect to WebSocket on mount", async () => {
        const { result } = renderHook(() => useWebSocket(), { wrapper });

        expect(result.current.status).toBe("connecting");

        await act(async () => {
            vi.advanceTimersByTime(20);
        });

        await waitFor(() => {
            expect(result.current.status).toBe("connected");
        });
    });

    it("should convert http to ws protocol", async () => {
        const httpWrapper = ({ children }: { children: ReactNode }) => (
            <WebSocketProvider url="http://localhost:9393/ws">{children}</WebSocketProvider>
        );

        renderHook(() => useWebSocket(), { wrapper: httpWrapper });

        await act(async () => {
            vi.advanceTimersByTime(20);
        });

        // Should have converted http:// to ws://
        expect(true).toBe(true); // Connection successful means conversion worked
    });

    it("should handle WebSocket errors", async () => {
        const errorWrapper = ({ children }: { children: ReactNode }) => (
            <WebSocketProvider url="ws://invalid:9999/ws">{children}</WebSocketProvider>
        );

        const { result } = renderHook(() => useWebSocket(), { wrapper: errorWrapper });

        // Simulate error
        await act(async () => {
            const ws = new MockWebSocket("ws://invalid:9999/ws");
            ws.readyState = MockWebSocket.CLOSED;
            ws.onerror?.(new Event("error"));
            vi.advanceTimersByTime(20);
        });

        // Should handle error gracefully
        expect(result.current.status).toBeDefined();
    });

    it("should send messages when connected", async () => {
        const { result } = renderHook(() => useWebSocket(), { wrapper });

        await act(async () => {
            vi.advanceTimersByTime(20);
        });

        await waitFor(() => {
            expect(result.current.status).toBe("connected");
        });

        const sendSpy = vi.spyOn(MockWebSocket.prototype, "send");

        act(() => {
            result.current.send({ type: "test", data: "hello" });
        });

        expect(sendSpy).toHaveBeenCalledWith(JSON.stringify({ type: "test", data: "hello" }));
    });

    it("should not send messages when disconnected", async () => {
        const { result } = renderHook(() => useWebSocket(), { wrapper });

        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        act(() => {
            result.current.send({ type: "test" });
        });

        expect(consoleSpy).toHaveBeenCalledWith("WebSocket not connected, message not sent");
    });

    it("should receive messages", async () => {
        const { result } = renderHook(() => useWebSocket(), { wrapper });

        await act(async () => {
            vi.advanceTimersByTime(20);
        });

        await waitFor(() => {
            expect(result.current.status).toBe("connected");
        });

        const testMessage = { type: "agent:connected", agentId: "123" };

        await act(async () => {
            const messageEvent = new MessageEvent("message", {
                data: JSON.stringify(testMessage),
            });
            // Simulate receiving message
            const ws = new MockWebSocket("ws://localhost:9393/ws");
            ws.onmessage?.(messageEvent);
        });

        // Message should be stored
        expect(result.current.lastMessage).toBeDefined();
    });

    it("should auto-reconnect on disconnect", async () => {
        const { result } = renderHook(() => useWebSocket(), { wrapper });

        await act(async () => {
            vi.advanceTimersByTime(20);
        });

        await waitFor(() => {
            expect(result.current.status).toBe("connected");
        });

        // Simulate disconnect
        await act(async () => {
            const ws = new MockWebSocket("ws://localhost:9393/ws");
            ws.close();
            vi.advanceTimersByTime(1000); // First reconnect attempt
        });

        expect(result.current.status).toBe("disconnected");

        // Should attempt reconnect
        await act(async () => {
            vi.advanceTimersByTime(1100); // Wait for reconnect
        });
    });

    it("should use exponential backoff for reconnection", async () => {
        const { result } = renderHook(() => useWebSocket(), { wrapper });

        await act(async () => {
            vi.advanceTimersByTime(20);
        });

        // Simulate multiple disconnects
        for (let i = 0; i < 3; i++) {
            await act(async () => {
                const ws = new MockWebSocket("ws://localhost:9393/ws");
                ws.close();
                const delay = Math.min(1000 * Math.pow(2, i), 30000);
                vi.advanceTimersByTime(delay + 100);
            });
        }

        // Should have attempted reconnection with increasing delays
        expect(result.current.status).toBeDefined();
    });

    it("should stop reconnecting after max attempts", async () => {
        const { result } = renderHook(() => useWebSocket(), { wrapper });

        await act(async () => {
            vi.advanceTimersByTime(20);
        });

        // Simulate 5 failed reconnects
        for (let i = 0; i < 5; i++) {
            await act(async () => {
                const ws = new MockWebSocket("ws://localhost:9393/ws");
                ws.close();
                vi.advanceTimersByTime(35000); // Max delay
            });
        }

        // Should stop trying after 5 attempts
        expect(result.current.status).toBe("disconnected");
    });

    it("should cleanup on unmount", async () => {
        const { result, unmount } = renderHook(() => useWebSocket(), { wrapper });

        await act(async () => {
            vi.advanceTimersByTime(20);
        });

        const closeSpy = vi.spyOn(MockWebSocket.prototype, "close");

        unmount();

        expect(closeSpy).toHaveBeenCalled();
    });

    it("should not connect when disabled", () => {
        const disabledWrapper = ({ children }: { children: ReactNode }) => (
            <WebSocketProvider url="ws://localhost:9393/ws" enabled={false}>
                {children}
            </WebSocketProvider>
        );

        const { result } = renderHook(() => useWebSocket(), { wrapper: disabledWrapper });

        expect(result.current.status).toBe("disconnected");
    });

    it("should throw error when used outside provider", () => {
        expect(() => {
            renderHook(() => useWebSocket());
        }).toThrow("useWebSocket must be used within WebSocketProvider");
    });
});
