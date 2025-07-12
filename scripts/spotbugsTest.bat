@REM SpotBugs lib Path C:\Tools\spotbugs-4.7.3\lib
set SPOTBUGS_HOME=C:\Tools\spotbugs-4.7.3
set SPOTBUGS_LIB=%SPOTBUGS_HOME%\lib

set targetClass=C:\sourcecode\vscode-spotbugs\javaext\com.spotbugs.analyzer\src\test\resource\PepperBoxKafkaSampler.class

@REM run spotbugs
java -jar %SPOTBUGS_LIB%\spotbugs.jar -textui -xml:withMessages=spotbugs.xml %targetClass%

pause