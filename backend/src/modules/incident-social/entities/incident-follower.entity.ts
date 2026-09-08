import { Entity, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, Unique, Index, JoinColumn } from 'typeorm';
import { IncidentEntity } from '../../../entities/incident.entity';
import { UserEntity } from '../../../entities/user.entity';

@Entity('incident_followers')
@Unique(['incident', 'user'])
export class IncidentFollower {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => IncidentEntity, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'incident_id' })
    incident: IncidentEntity;

    @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    @Index()
    user: UserEntity;

    @CreateDateColumn()
    createdAt: Date;
}
