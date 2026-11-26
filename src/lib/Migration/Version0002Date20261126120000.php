<?php

declare(strict_types=1);

namespace OCA\Lignees\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\Types;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Ponts entre arbres : une même personne présente dans deux arbres (par exemple une conjointe dans l'arbre
 * de son mari et une fille dans l'arbre de ses parents). Un pont relie les deux fiches ; il ne copie rien.
 */
final class Version0002Date20261126120000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $oOutput, Closure $fnSchemaClosure, array $aOptions): ?ISchemaWrapper {
        /** @var ISchemaWrapper $oSchema */
        $oSchema = $fnSchemaClosure();
        if ($oSchema->hasTable('lignees_passerelles')) {
            return null;
        }
        $oTable = $oSchema->createTable('lignees_passerelles');
        $oTable->addColumn('id', Types::BIGINT, ['autoincrement' => true, 'notnull' => true, 'unsigned' => true]);
        $oTable->addColumn('person_id', Types::BIGINT, ['notnull' => true, 'unsigned' => true]);
        $oTable->addColumn('cible_id', Types::BIGINT, ['notnull' => true, 'unsigned' => true]);
        $oTable->addColumn('created_by', Types::STRING, ['notnull' => true, 'length' => 64, 'default' => '']);
        $oTable->addColumn('created_at', Types::BIGINT, ['notnull' => true, 'default' => 0]);
        $oTable->setPrimaryKey(['id']);
        $oTable->addUniqueIndex(['person_id', 'cible_id'], 'lignees_pass_paire');
        $oTable->addIndex(['cible_id'], 'lignees_pass_cible');
        return $oSchema;
    }
}
