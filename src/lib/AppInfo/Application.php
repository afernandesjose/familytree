<?php
declare(strict_types=1);
/**
 * Testovací bootstrap aplikace bez registrace služeb a databázových migrací.
 * Maďarská notace: s = string, n = number, o = object.
 */
namespace OCA\HcFamilyTree\AppInfo;
use OCP\AppFramework\App;
final class Application extends App {
    public const APP_ID = 'hc_familytree';
    /** Inicializuje aplikaci bez dalších závislostí; bez návratové hodnoty. */
    public function __construct() { parent::__construct(self::APP_ID); }
}
