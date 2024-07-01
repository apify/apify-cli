import { MockSTDIN, stdin as fstdin } from 'mock-stdin';

interface ProcessMockOptions {
    cwdMock: () => string;
    mockStdin?: boolean;
}

export function useProcessMock({ cwdMock, mockStdin }: ProcessMockOptions) {
    let actualStdin: unknown = process.stdin;

    if (mockStdin) {
        actualStdin = fstdin();
    }

    vitest.doMock('node:process', async () => {
        const actual = await import('node:process');

        return {
            ...actual,
            cwd: cwdMock,
            stdin: actualStdin,
            default: {
                ...actual,
                cwd: cwdMock,
                stdin: actualStdin,
            },
        };
    });

    vitest.doMock('process', async () => {
        const actual = await import('process');

        return {
            ...actual,
            cwd: cwdMock,
            stdin: actualStdin,
            default: {
                ...actual,
                cwd: cwdMock,
                stdin: actualStdin,
            },
        };
    });

    const processCwdSpy = vitest.spyOn(process, 'cwd');
    processCwdSpy.mockImplementation(cwdMock);

    return {
        stdin: actualStdin as MockSTDIN,
    };
}
