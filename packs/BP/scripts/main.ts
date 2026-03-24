import { ButtonState, ContainerSlot, EntityDamageCause, EntityEquippableComponent, EntityHurtBeforeEvent, EntityOnFireComponent, EquipmentSlot, GameMode, InputButton, ItemCooldownComponent, ItemDurabilityComponent, ItemEnchantableComponent, ItemStack, Player, system, world } from "@minecraft/server"



/**
 * OPTIONAL SCRIPTS TO RUN ON SHIELD BLOCK
 */
const Shields: { [id: string]: (data: { item: ItemStack, slot: ContainerSlot, source: Player, event: EntityHurtBeforeEvent }) => void } = {
    // "custom_shield:custom_shield": (data) => {
    //     world.sendMessage("this is a script")
    // }
}














const shieldingPlayers: { [id: string]: boolean } = {}

function getHeldShield(player: Player, withCooldown: boolean = true): { item: ItemStack, slot: ContainerSlot, hand: "main_hand" | "off_hand" } | undefined {
    function isValidShield(item: ItemStack) {
        if (!item.hasComponent("custom_shield:shield")) return false
        if (withCooldown) {
            const cooldownComp = item.getComponent(ItemCooldownComponent.componentId)
            if (cooldownComp && cooldownComp.getCooldownTicksRemaining(player) > 0) return false
        }
        return true
    }
    const equippable = player.getComponent(EntityEquippableComponent.componentId)
    if (!equippable) return undefined
    const offhand = equippable.getEquipmentSlot(EquipmentSlot.Offhand)
    const offItem = offhand.getItem()
    if (offItem && isValidShield(offItem)) return { item: offItem, slot: offhand, hand: "off_hand" };
    const mainhand = equippable.getEquipmentSlot(EquipmentSlot.Mainhand)
    const item = mainhand.getItem()
    if (item && isValidShield(item)) return { item: item, slot: mainhand, hand: "main_hand" };
    return undefined
}

const delays: { [id: string]: number } = {}

const visualDelays: { [id: string]: number } = {}

const heldShield: { [id: string]: string } = {}

const animations: { [id: string]: string | undefined } = {}

const usingItem: { [id: string]: boolean } = {}

function runDelay(player: Player, delay: number, visual: boolean = true) {
    if (delays[player.id]) system.clearRun(delays[player.id]);
    if (!visual) delete visualDelays[player.id]
    const playerId = player.id
    const id = system.runTimeout(() => {
        delete delays[playerId]
    }, delay * 20)
    delays[playerId] = id
    if (visual) {
        if (visualDelays[player.id]) system.clearRun(visualDelays[player.id]);
        const id = system.runTimeout(() => {
            delete visualDelays[playerId]
        }, delay * 20)
        visualDelays[playerId] = id
    }
}

system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        const shield = getHeldShield(player)
        const delay = (shield?.item.getComponent("custom_shield:shield")?.customComponentParameters.params as { delay?: number } | undefined)?.delay
        if (shield?.item.typeId !== heldShield[player.id]) {
            if (!shield?.item) {
                if (delays[player.id]) {
                    system.clearRun(delays[player.id])
                    delete delays[player.id]
                }
            }
            if (delay !== undefined) runDelay(player, delay)
        }
        let anim = undefined
        if (shield !== undefined && player.isSneaking) {
            anim = `animation.custom_shield.player.shield_block_${shield.hand}`
        }
        if (usingItem[player.id] || visualDelays[player.id] !== undefined || !player.isSneaking || (!shield || (shield.item.getComponent(ItemCooldownComponent.componentId)?.getCooldownTicksRemaining(player) ?? 0) > 0)) {
            anim = undefined
            if (animations[player.id]) {
                player.playAnimation(animations[player.id] as string, { blendOutTime: 0, stopExpression: "return true;" })
                delete animations[player.id]
            }
        } else {
            if (animations[player.id] !== anim) {
                if (animations[player.id]) player.playAnimation(animations[player.id] as string, { blendOutTime: 0, stopExpression: "return true;" });
                if (anim) {
                    player.playAnimation(anim, { blendOutTime: 99999, stopExpression: "q.is_sneaking" })
                }
            }
        }
        animations[player.id] = anim
        if (shield) {
            heldShield[player.id] = shield.item.typeId
        } else delete heldShield[player.id]
        shieldingPlayers[player.id] = shield !== undefined && player.isSneaking
    }
})

world.afterEvents.playerButtonInput.subscribe((data) => {
    if (data.button === InputButton.Sneak) {
        if (data.newButtonState === ButtonState.Pressed) {
            const shield = getHeldShield(data.player)
            const delay = (shield?.item.getComponent("custom_shield:shield")?.customComponentParameters.params as { delay?: number } | undefined)?.delay
            if (delay !== undefined) runDelay(data.player, delay, false)
        } else {
            const currentDelay = delays[data.player.id]
            if (currentDelay) system.clearRun(currentDelay)
            delete delays[data.player.id]
        }
    }
})

world.afterEvents.playerSwingStart.subscribe((data) => {
    if (!data.player.isSneaking) return
    const shield = getHeldShield(data.player)
    const delay = (shield?.item.getComponent("custom_shield:shield")?.customComponentParameters.params as { delay?: number } | undefined)?.delay
    if (delay !== undefined) runDelay(data.player, delay)
})

const cancelledEffects: { [id: string]: boolean } = {

}

world.beforeEvents.entityHurt.subscribe((data) => {
    if (!(data.hurtEntity instanceof Player)) return
    let preDamageValue = data.damage
    const player = data.hurtEntity
    const equip = player.getComponent(EntityEquippableComponent.componentId)
    if (equip) {
        let totalProtection = 0
        let totalArmor = 0
        for (const equipSlot in EquipmentSlot) {
            if (equipSlot.includes("hand")) continue
            const slot = equip.getEquipmentSlot(EquipmentSlot[equipSlot as EquipmentSlot])
            const item = slot.getItem()
            if (item) {
                const ench = item.getComponent(ItemEnchantableComponent.componentId)
                const prot = ench?.getEnchantment("protection")
                const proj = ench?.getEnchantment("projectile_protection")
                if (prot) totalProtection += prot.level
                if (proj && data.damageSource.cause === EntityDamageCause.projectile) totalProtection += proj.level
                if (ARMOR_VALUES[item.typeId]) totalArmor += ARMOR_VALUES[item.typeId]
            }
        }
        if (totalArmor) preDamageValue = preDamageValue / (1 - (totalArmor * 0.03875))
        if (totalProtection) preDamageValue = preDamageValue / (1 - (totalProtection * 0.03875))
    }
    if (!shieldingPlayers[player.id] || delays[player.id] !== undefined || usingItem[player.id]) return

    const playerLoc = player.location
    const viewDir = player.getViewDirection()
    const viewDirLoc = {
        x: playerLoc.x + (viewDir.x * 0.01),
        y: playerLoc.y,
        z: playerLoc.z + (viewDir.z * 0.01)
    }
    const damageLocation = data.damageSource.damagingEntity?.location ?? data.damageSource.damagingProjectile?.location
    if (!damageLocation) return
    const pTotal = Math.abs(playerLoc.x - damageLocation.x) + Math.abs(playerLoc.y - damageLocation.y) + Math.abs(playerLoc.z - damageLocation.z)
    const vTotal = Math.abs(viewDirLoc.x - damageLocation.x) + Math.abs(viewDirLoc.y - damageLocation.y) + Math.abs(viewDirLoc.z - damageLocation.z)
    if (pTotal < vTotal) return
    let disableShield = false
    if (data.damageSource.damagingEntity) {
        const disableConditions = [
            data.damageSource.damagingEntity.typeId === "minecraft:vindicator",
            data.damageSource.damagingEntity.typeId === "minecraft:piglin_brute",
            data.damageSource.damagingEntity.typeId === "minecraft:warden" && data.damageSource.cause === EntityDamageCause.entityAttack,
        ]
        if (disableConditions.find((f) => f == true)) {
            disableShield = true
        } else {
            const equippable = data.damageSource.damagingEntity.getComponent(EntityEquippableComponent.componentId)
            if (equippable?.getEquipmentSlot(EquipmentSlot.Mainhand).getItem()?.hasTag("minecraft:is_axe")) disableShield = true
        }
    }
    let hadFire = player.getComponent(EntityOnFireComponent.componentId) !== undefined
    cancelledEffects[player.id] = true
    const id = player.id
    system.run(() => {
        delete cancelledEffects[id]
        const shield = getHeldShield(player)
        if (!shield) return
        if (data.damageSource.damagingEntity?.typeId === "minecraft:ravager" && data.damageSource.cause === EntityDamageCause.entityAttack) data.damageSource.damagingEntity.triggerEvent("minecraft:become_stunned")
        if (!hadFire && player.getComponent(EntityOnFireComponent.componentId)) player.extinguishFire()
        if (Shields[shield.item.typeId]) Shields[shield.item.typeId]({ event: data, item: shield.item, source: player, slot: shield.slot })
        if (shield.item.hasComponent(ItemDurabilityComponent.componentId)) {
            let damage = preDamageValue
            if (damage > Math.floor(damage)) damage = Math.floor(damage);
            damage += 1
            shield.slot.setItem(reduceDurability(player, shield.item, damage))
        }
        const comp = shield.item.getComponent("custom_shield:shield")?.customComponentParameters.params as { block?: string, delay?: number, command?: string, disable_sound?: string, knockback?: { x: number, y: number } }
        if (comp.knockback && data.damageSource.damagingEntity && !data.damageSource.damagingProjectile) {
            const total = Math.abs(damageLocation.x - playerLoc.x) + Math.abs(damageLocation.z - playerLoc.z)
            try { data.damageSource.damagingEntity.applyKnockback({ x: ((damageLocation.x - playerLoc.x) / total) * (comp.knockback.x ?? 0), z: ((damageLocation.z - playerLoc.z) / total) * (comp.knockback.x ?? 0) }, comp.knockback.y ?? 0.1) } catch { }
        }
        const cooldown = shield.item.getComponent(ItemCooldownComponent.componentId)
        if (comp.block) player.dimension.playSound(comp.block, player.location);
        if (comp.command) player.runCommand(comp.command)
        if (cooldown !== undefined && disableShield) {
            cooldown.startCooldown(player)
            if (comp.disable_sound) player.dimension.playSound(comp.disable_sound, player.location)
        }
    })
    data.cancel = true
})

world.beforeEvents.effectAdd.subscribe((data) => {
    if (!cancelledEffects[data.entity.id]) return
    data.cancel = true
})

system.beforeEvents.startup.subscribe((data) => {
    data.itemComponentRegistry.registerCustomComponent("custom_shield:shield", {})
})

export function reduceDurability(player: Player, item: ItemStack, damage: number): ItemStack | undefined {
    if (player.getGameMode() === GameMode.Creative) return item
    const durComp = item.getComponent(ItemDurabilityComponent.componentId) as ItemDurabilityComponent | undefined
    if (!durComp) return item;
    const enchComp = item.getComponent(ItemEnchantableComponent.componentId) as ItemEnchantableComponent | undefined
    const unbreaking = enchComp?.getEnchantment("unbreaking")
    if (unbreaking !== undefined) {
        const chance = 100 / (unbreaking.level + 1);
        const random = Math.random() * 100;
        if (random >= (100 - chance)) {
            if (durComp.damage + damage > durComp.maxDurability) {
                player.dimension.playSound("random.break", player.location)
                return undefined
            } else {
                durComp.damage += damage
                return item
            }
        }
        return item
    }
    if (durComp.damage + damage > durComp.maxDurability) {
        player.dimension.playSound("random.break", player.location)
        return undefined
    } else {
        durComp.damage += damage
        return item
    }

}

world.afterEvents.playerLeave.subscribe((data) => {
    delete animations[data.playerId]
    delete heldShield[data.playerId]
    delete shieldingPlayers[data.playerId]
    delete usingItem[data.playerId]
})

world.afterEvents.itemStartUse.subscribe((data) => {
    usingItem[data.source.id] = true
})

world.afterEvents.itemStopUse.subscribe((data) => {
    delete usingItem[data.source.id]
})

world.afterEvents.itemReleaseUse.subscribe((data) => {
    delete usingItem[data.source.id]
})







export const ARMOR_VALUES: { [id: string]: number } = {
    /**
     * HELMETS
     */
    "minecraft:leather_helmet": 1,
    "minecraft:copper_helmet": 2,
    "minecraft:golden_helmet": 2,
    "minecraft:chainmail_helmet": 2,
    "minecraft:iron_helmet": 2,
    "minecraft:turtle_helmet": 2,
    "minecraft:diamond_helmet": 3,
    "minecraft:netherite_helmet": 3,
    /**
     * CHESTPLATES
     */
    "minecraft:leather_chestplate": 3,
    "minecraft:copper_chestplate": 4,
    "minecraft:golden_chestplate": 5,
    "minecraft:chainmail_chestplate": 5,
    "minecraft:iron_chestplate": 6,
    "minecraft:diamond_chestplate": 8,
    "minecraft:netherite_chestplate": 8,
    /**
     * LEGGINGS
     */
    "minecraft:leather_leggings": 2,
    "minecraft:copper_leggings": 3,
    "minecraft:golden_leggings": 3,
    "minecraft:chainmail_leggings": 4,
    "minecraft:iron_leggings": 5,
    "minecraft:diamond_leggings": 6,
    "minecraft:netherite_leggings": 6,
    /**
     * BOOTS
     */
    "minecraft:leather_boots": 1,
    "minecraft:copper_boots": 1,
    "minecraft:golden_boots": 1,
    "minecraft:chainmail_boots": 1,
    "minecraft:iron_boots": 2,
    "minecraft:diamond_boots": 3,
    "minecraft:netherite_boots": 3
}