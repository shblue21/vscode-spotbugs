package fixtures.sarif;

public class SarifFixtureSample {
  private String neverRead;

  public int nullPointerLength() {
    String value = null;
    return value.length();
  }
}
