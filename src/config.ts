interface Config {
  /**
   * Effort value adjusts internal flags of SpotBugs, to reduce computation cost by lowering the prediction.
   */
  effort: string;
  /**
   * java home path
   */
  java: {
    home: string;
  };
  /**
   * SpotBugs plugin configuration
   */
  plugins: {
    /**
     * SpotBugs plugin path
     */
    files: string[];
  };
}
