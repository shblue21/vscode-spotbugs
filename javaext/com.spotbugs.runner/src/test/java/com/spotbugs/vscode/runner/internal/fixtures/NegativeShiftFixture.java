package com.spotbugs.vscode.runner.internal.fixtures;

public final class NegativeShiftFixture {

    public int shift(int value) {
        return value << -1;
    }
}
