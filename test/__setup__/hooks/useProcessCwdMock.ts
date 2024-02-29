export function useProcessCwdMock(cwdMock: () => string) {
    vitest.doMock('node:process', async (importActual) => {
        const actual = await importActual<typeof import('node:process')>();

        return {
            ...actual,
            cwd: cwdMock,
            default: {
                ...actual,
                cwd: cwdMock,
            },
        };
    });

    const processCwdSpy = vitest.spyOn(process, 'cwd');
    processCwdSpy.mockImplementation(cwdMock);
}
