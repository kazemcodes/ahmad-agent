<?php
require __DIR__.'/../src/AttendanceCheckIn.php';
foreach ([['مسعود زارعی حاضر','مسعود زارعی'],['مسعود زارعی حاضر!','مسعود زارعی'],['حاضر',null],['چه کسانی حاضر بودند؟',null]] as [$text,$expected]) if (AttendanceCheckIn::name($text)!==$expected) throw new RuntimeException('invalid check-in parsing');
echo "Check-in checks passed.\n";
