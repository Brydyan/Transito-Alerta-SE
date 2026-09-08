import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, Unique, Index, JoinColumn } from 'typeorm';
import { IncidentEntity } from '../../../entities/incident.entity';
import { UserEntity } from '../../../entities/user.entity';

@Entity('incident_corroborations')
@Unique(['incident', 'user'])
export class IncidentCorroboration {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => IncidentEntity, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'incident_id' })
    @Index()
    incident: IncidentEntity;

    @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: UserEntity;

    @Column({ type: 'text', nullable: true })
    comment: string | null;

    @CreateDateColumn()
    createdAt: Date;
}
